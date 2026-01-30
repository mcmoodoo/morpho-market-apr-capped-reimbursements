import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import { MARKET_ID, BLOCKS_PER_HOUR, APR_CAP_PERCENT } from "../lib/refund/config.ts";
import { fetchAllEvents } from "../lib/refund/events.ts";
import { buildTimeline, calculateOverpayments } from "../lib/refund/calculator.ts";
import { generateReport, writeReport } from "../lib/refund/report.ts";

async function main() {
  // Validate RPC
  const rpc = process.env.INFURA_POLYGON_MAINNET_RPC;
  if (!rpc) {
    console.error("Error: INFURA_POLYGON_MAINNET_RPC not set");
    process.exit(1);
  }

  // Create client
  const client = createPublicClient({
    chain: polygon,
    transport: http(rpc),
  });

  console.log("Morpho Blue Refund Indexer");
  console.log("==========================");
  console.log(`Market: ${MARKET_ID}`);
  console.log(`APR Cap: ${APR_CAP_PERCENT}%`);

  // Get block range
  const currentBlock = await client.getBlockNumber();
  const startBlock = currentBlock - BLOCKS_PER_HOUR;

  console.log(`\nBlock range: ${startBlock} → ${currentBlock}`);

  // Estimate timestamps based on block numbers (no RPC calls needed)
  // Polygon ~2 seconds per block
  const BLOCK_TIME_SECONDS = 2;
  const endTimestamp = Math.floor(Date.now() / 1000);
  const startTimestamp = endTimestamp - Number(BLOCKS_PER_HOUR) * BLOCK_TIME_SECONDS;

  const durationMinutes = Math.round((endTimestamp - startTimestamp) / 60);
  console.log(`Time range: ~${durationMinutes} minutes (estimated)`);

  // Fetch events
  console.log("\nFetching events...");
  const events = await fetchAllEvents(client, startBlock, currentBlock, endTimestamp);
  console.log(`  AccrueInterest: ${events.accrue.length}`);
  console.log(`  Borrow: ${events.borrow.length}`);
  console.log(`  Repay: ${events.repay.length}`);
  console.log(`  Liquidate: ${events.liquidate.length}`);

  // Build timeline
  const timeline = buildTimeline(
    events.accrue,
    events.borrow,
    events.repay,
    events.liquidate
  );
  console.log(`\nTimeline events: ${timeline.length}`);

  // Calculate overpayments
  console.log("Calculating overpayments...");
  const overpayments = calculateOverpayments(
    timeline,
    startTimestamp,
    endTimestamp
  );

  // Generate and write report
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
