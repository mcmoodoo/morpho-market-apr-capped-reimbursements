import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";
import { MARKET_ID, BLOCKS_PER_24_HOURS, BLOCKS_PER_1_HOUR } from "../lib/refund/config.ts";
import { fetchAllEvents } from "../lib/refund/events.ts";
import { buildTimeline } from "../lib/refund/calculator.ts";
import { getLastSyncedBlock, insertEvents } from "../lib/refund/db.ts";

const FALLBACK_FLAGS = ["--fallback-to-interpolation", "-f"];

async function main() {
  const args = process.argv.slice(2);
  const fallbackToInterpolation = args.some((a) => FALLBACK_FLAGS.includes(a));

  const rpc = process.env.INFURA_ARBITRUM_MAINNET_RPC;
  if (!rpc) {
    console.error("Error: INFURA_ARBITRUM_MAINNET_RPC not set");
    process.exit(1);
  }

  const client = createPublicClient({
    chain: arbitrum,
    transport: http(rpc),
  });

  console.log("Morpho Blue Event Sync");
  console.log("======================");
  console.log(`Market: ${MARKET_ID}`);

  const currentBlock = await client.getBlockNumber();
  const lastSynced = getLastSyncedBlock(MARKET_ID);

  let fetchFromBlock: bigint;
  let fetchToBlock: bigint;

  if (lastSynced === null) {
    // DB empty or doesn't exist: start from 24h ago, fetch only ~1h of blocks
    fetchFromBlock = currentBlock - BLOCKS_PER_24_HOURS;
    fetchToBlock =
      fetchFromBlock + BLOCKS_PER_1_HOUR - 1n > currentBlock
        ? currentBlock
        : fetchFromBlock + BLOCKS_PER_1_HOUR - 1n;
    console.log("\nDB empty or missing: starting from 24h ago, fetching first ~1h of blocks");
  } else {
    // DB has data: resume from last synced block, fetch next ~1h of blocks
    fetchFromBlock = lastSynced + 1n;
    fetchToBlock =
      lastSynced + BLOCKS_PER_1_HOUR > currentBlock
        ? currentBlock
        : lastSynced + BLOCKS_PER_1_HOUR;
    console.log("\nResuming from last synced block, fetching next ~1h of blocks");
  }

  if (fetchFromBlock > fetchToBlock) {
    console.log("Already synced up to current block. Nothing to fetch.");
    return;
  }

  console.log(`Block range: ${fetchFromBlock} → ${fetchToBlock}`);

  const [startBlockData, endBlockData] = await Promise.all([
    client.getBlock({ blockNumber: fetchFromBlock }),
    client.getBlock({ blockNumber: fetchToBlock }),
  ]);
  const startTimestamp = Number(startBlockData.timestamp);
  const endTimestamp = Number(endBlockData.timestamp);
  const now = Math.floor(Date.now() / 1000);
  const startHoursAgo = ((now - startTimestamp) / 3600).toFixed(1);
  const endHoursAgo = ((now - endTimestamp) / 3600).toFixed(1);
  const durationHours = ((endTimestamp - startTimestamp) / 3600).toFixed(1);
  console.log(`Time range: from ${startHoursAgo}h ago to ${endHoursAgo}h ago (${durationHours}h span)`);
  console.log(`  ${new Date(startTimestamp * 1000).toISOString()} → ${new Date(endTimestamp * 1000).toISOString()}`);

  if (fallbackToInterpolation) {
    console.log("(fallbackToInterpolation enabled: will interpolate if a block timestamp is missing)");
  }
  console.log("\nFetching events from RPC...");
  const events = await fetchAllEvents(
    client,
    fetchFromBlock,
    fetchToBlock,
    startTimestamp,
    endTimestamp,
    { rpcUrl: rpc, fallbackToInterpolation }
  );
  console.log(`  AccrueInterest: ${events.accrue.length}`);
  console.log(`  Borrow: ${events.borrow.length}`);
  console.log(`  Repay: ${events.repay.length}`);
  console.log(`  Liquidate: ${events.liquidate.length}`);

  const timeline = buildTimeline(
    events.accrue,
    events.borrow,
    events.repay,
    events.liquidate
  );
  console.log(`\nTimeline events: ${timeline.length}`);

  console.log("Saving events to DB...");
  insertEvents(MARKET_ID, timeline);
  console.log(`  Saved ${timeline.length} events`);

  console.log("\nSync done.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
