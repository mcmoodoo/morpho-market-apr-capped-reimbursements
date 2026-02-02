/**
 * Sync Morpho events for a fixed block range into SQLite.
 * Always clears the DB, then fetches 427663781 → 427682051 and saves.
 */

import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";
import { MARKET_ID } from "../lib/refund/config.ts";
import { fetchAllEvents } from "../lib/refund/events.ts";
import { clearDb, insertBlockTimestamps, insertEvents } from "../lib/refund/db.ts";
import type { TimelineEvent } from "../lib/refund/types.ts";

const START_BLOCK = 427663781n;
const END_BLOCK = 427682051n;

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
  const rpc = process.env.INFURA_ARBITRUM_MAINNET_RPC;
  if (!rpc) {
    console.error("INFURA_ARBITRUM_MAINNET_RPC not set");
    process.exit(1);
  }

  const client = createPublicClient({
    chain: arbitrum,
    transport: http(rpc),
  });

  const [startBlockData, endBlockData] = await Promise.all([
    client.getBlock({ blockNumber: START_BLOCK }),
    client.getBlock({ blockNumber: END_BLOCK }),
  ]);
  const startTimestamp = Number(startBlockData.timestamp);
  const endTimestamp = Number(endBlockData.timestamp);

  console.log("Clear DB");
  clearDb();

  console.log(`Fetch events ${START_BLOCK} → ${END_BLOCK}`);
  const { events, blockTimestamps } = await fetchAllEvents(
    client,
    START_BLOCK,
    END_BLOCK,
    startTimestamp,
    endTimestamp,
    { rpcUrl: rpc }
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

  console.log("Save to DB");
  insertEvents(MARKET_ID, timeline);
  insertBlockTimestamps(blockTimestamps);
  console.log(`  ${timeline.length} events, ${blockTimestamps.size} block timestamps`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
