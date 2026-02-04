/**
 * Sync Morpho events into SQLite.
 *
 * Two modes:
 * 1. With startBlock (e.g. bun run sync 427663781): backfill from that block to current.
 *    Allowed only when DB is empty. Fetches in small chunks (10k blocks) with delay to avoid rate limits.
 * 2. Without params (bun run sync): resume from last block in DB to current.
 *    Allowed only when DB is non-empty. Same chunking and delay.
 *
 * Any other case (e.g. startBlock given but DB has data, or no startBlock but DB empty): exit gracefully.
 */

import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import { fetchAllEvents } from "../lib/refund/events.ts";
import { checkPostgresConnection, getMaxBlockInEvents, insertBlockTimestamps, insertEvents } from "../lib/refund/db.ts";
import type { TimelineEvent } from "../lib/refund/types.ts";

const CHUNK_BLOCKS = 10_000n;
const RPC_DELAY_MS = 400;
const CHUNK_DELAY_MS = 3000;

function parseArgs(): { startBlock: bigint | null } {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--start-block" && args[i + 1]) {
      try {
        const n = BigInt(args[++i]);
        if (n >= 0n) return { startBlock: n };
      } catch {
        /* skip */
      }
      continue;
    }
    try {
      const n = BigInt(args[i]);
      if (n >= 0n && args[i].trim() !== "") return { startBlock: n };
    } catch {
      /* not a number */
    }
  }
  return { startBlock: null };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("Throttled")
  );
}

function buildTimeline(
  accrue: TimelineEvent[],
  borrow: TimelineEvent[],
  repay: TimelineEvent[],
  liquidate: TimelineEvent[]
): TimelineEvent[] {
  const all: TimelineEvent[] = [...accrue, ...borrow, ...repay, ...liquidate];
  return all.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex;
    return a.logIndex - b.logIndex;
  });
}

async function main() {
  const { startBlock: startBlockArg } = parseArgs();
  const rpc = process.env.INFURA_POLYGON_MAINNET_RPC;
  if (!rpc) {
    console.error("INFURA_POLYGON_MAINNET_RPC not set");
    process.exit(1);
  }

  try {
    await checkPostgresConnection();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const client = createPublicClient({
    chain: polygon,
    transport: http(rpc),
  });

  const maxBlock = await getMaxBlockInEvents();
  const dbHasData = maxBlock !== null;

  if (startBlockArg !== null) {
    if (dbHasData) {
      console.error("DB already has data (max block", maxBlock?.toString(), ").");
      console.error("Run without parameters to resume, or clear the DB first.");
      process.exit(0);
    }
  } else {
    if (!dbHasData) {
      console.error("DB is empty. Run with a startBlock to begin backfill, e.g.:");
      console.error("  bun run sync 427663781");
      console.error("  bun run sync --start-block 427663781");
      process.exit(0);
    }
  }

  const fromBlock = startBlockArg !== null ? startBlockArg : maxBlock! + 1n;
  const currentBlock = await client.getBlockNumber();
  const toBlock = currentBlock;

  if (fromBlock > toBlock) {
    console.log("Already at or past current block. Nothing to fetch.");
    process.exit(0);
  }

  const mode = startBlockArg !== null ? "backfill" : "resume";
  console.log("Sync mode:", mode);
  console.log("Block range:", fromBlock.toString(), "→", toBlock.toString());
  console.log("Chunk size:", CHUNK_BLOCKS.toString(), "blocks, delay", RPC_DELAY_MS, "ms between RPC calls,", CHUNK_DELAY_MS, "ms between chunks");
  console.log("");

  let cursor = fromBlock;
  let totalEvents = 0;
  let chunkIndex = 0;

  while (cursor <= toBlock) {
    const chunkEnd = cursor + CHUNK_BLOCKS - 1n > toBlock ? toBlock : cursor + CHUNK_BLOCKS - 1n;

    try {
      const [startBlockData, endBlockData] = await Promise.all([
        client.getBlock({ blockNumber: cursor }),
        client.getBlock({ blockNumber: chunkEnd }),
      ]);
      const startTimestamp = Number(startBlockData.timestamp);
      const endTimestamp = Number(endBlockData.timestamp);

      const { events, blockTimestamps } = await fetchAllEvents(
        client,
        cursor,
        chunkEnd,
        startTimestamp,
        endTimestamp,
        { rpcUrl: rpc, maxBlocksPerChunk: CHUNK_BLOCKS, fallbackToInterpolation: true }
      );

      const timeline = buildTimeline(
        events.accrue,
        events.borrow,
        events.repay,
        events.liquidate
      );
      await insertEvents(timeline);
      await insertBlockTimestamps(blockTimestamps);

      totalEvents += timeline.length;
      chunkIndex++;
      const endBlockTime = new Date(endTimestamp * 1000).toISOString();
      console.log(
        `Chunk ${chunkIndex}: blocks ${cursor} → ${chunkEnd} (${endBlockTime}), ${timeline.length} events (total ${totalEvents})`
      );

      cursor = chunkEnd + 1n;
      if (cursor <= toBlock) await sleep(CHUNK_DELAY_MS);
    } catch (err) {
      if (isRateLimitError(err)) {
        console.error("Rate limited. Stopping. Last synced block:", (cursor - 1n).toString());
        process.exit(0);
      }
      throw err;
    }
  }

  console.log("");
  console.log("Done. Synced up to block", toBlock.toString(), "(" + totalEvents, "events total).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
