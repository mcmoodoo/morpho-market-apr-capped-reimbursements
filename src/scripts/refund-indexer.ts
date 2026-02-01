import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";
import { MARKET_ID, BLOCKS_PER_24_HOURS, APR_CAP_PERCENT } from "../lib/refund/config.ts";
import { fetchAllEvents } from "../lib/refund/events.ts";
import { buildTimeline, calculateOverpayments } from "../lib/refund/calculator.ts";
import { generateReport, writeReport } from "../lib/refund/report.ts";
import { getEvents, getLastSyncedBlock, insertEvents } from "../lib/refund/db.ts";

async function main() {
  const rpc = process.env.INFURA_ARBITRUM_MAINNET_RPC;
  if (!rpc) {
    console.error("Error: INFURA_ARBITRUM_MAINNET_RPC not set");
    process.exit(1);
  }

  const client = createPublicClient({
    chain: arbitrum,
    transport: http(rpc),
  });

  console.log("Morpho Blue Refund Indexer");
  console.log("==========================");
  console.log(`Market: ${MARKET_ID}`);
  console.log(`APR Cap: ${APR_CAP_PERCENT}%`);

  // Block range: last 24 hours
  const currentBlock = await client.getBlockNumber();
  const startBlock = currentBlock - BLOCKS_PER_24_HOURS;

  console.log(`\nBlock range: ${startBlock} → ${currentBlock}`);

  const [startBlockData, endBlockData] = await Promise.all([
    client.getBlock({ blockNumber: startBlock }),
    client.getBlock({ blockNumber: currentBlock }),
  ]);
  const startTimestamp = Number(startBlockData.timestamp);
  const endTimestamp = Number(endBlockData.timestamp);

  const durationHours = ((endTimestamp - startTimestamp) / 3600).toFixed(1);
  console.log(`Time range: ${durationHours} hours`);

  // Use DB if we already have events covering this range (skip RPC getLogs)
  const lastSynced = getLastSyncedBlock(MARKET_ID);
  const rangeCovered = lastSynced !== null && lastSynced >= currentBlock;

  let timeline: ReturnType<typeof buildTimeline> extends Promise<infer T> ? T : ReturnType<typeof buildTimeline>;
  if (rangeCovered) {
    console.log("\nUsing events from DB (range already synced, skipping RPC getLogs)");
    timeline = getEvents(MARKET_ID, startBlock, currentBlock);
    console.log(`  Timeline events: ${timeline.length}`);
  } else {
    console.log("\nFetching events from RPC...");
    const events = await fetchAllEvents(
      client,
      startBlock,
      currentBlock,
      startTimestamp,
      endTimestamp
    );
    console.log(`  AccrueInterest: ${events.accrue.length}`);
    console.log(`  Borrow: ${events.borrow.length}`);
    console.log(`  Repay: ${events.repay.length}`);
    console.log(`  Liquidate: ${events.liquidate.length}`);

    timeline = buildTimeline(
      events.accrue,
      events.borrow,
      events.repay,
      events.liquidate
    );
    console.log(`\nTimeline events: ${timeline.length}`);

    console.log("Saving events to DB...");
    insertEvents(MARKET_ID, timeline);
    console.log(`  Saved ${timeline.length} events`);
  }

  // Calculate overpayments
  console.log("\nCalculating overpayments...");
  const overpayments = calculateOverpayments(
    timeline,
    startTimestamp,
    endTimestamp
  );

  const report = generateReport(
    overpayments,
    startBlock,
    currentBlock,
    startTimestamp,
    endTimestamp
  );

  console.log("");
  await writeReport(report);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
