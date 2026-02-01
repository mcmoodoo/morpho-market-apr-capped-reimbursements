import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";
import { MARKET_ID, BLOCKS_PER_24_HOURS, APR_CAP_PERCENT } from "../lib/refund/config.ts";
import { fetchAllEvents } from "../lib/refund/events.ts";
import { fetchAllEventsFromSubgraph } from "../lib/refund/subgraph.ts";
import { buildTimeline, calculateOverpayments } from "../lib/refund/calculator.ts";
import { generateReport, writeReport } from "../lib/refund/report.ts";

async function main() {
  const useSubgraph = Boolean(process.env.SUBGRAPH_URL);

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
  console.log(`Data source: ${useSubgraph ? "subgraph" : "RPC"}`);

  // Block range: last 24 hours
  const currentBlock = await client.getBlockNumber();
  const startBlock = currentBlock - BLOCKS_PER_24_HOURS;

  console.log(`\nBlock range: ${startBlock} → ${currentBlock}`);

  // Real timestamps from chain (2 getBlock calls) — no estimation
  const [startBlockData, endBlockData] = await Promise.all([
    client.getBlock({ blockNumber: startBlock }),
    client.getBlock({ blockNumber: currentBlock }),
  ]);
  const startTimestamp = Number(startBlockData.timestamp);
  const endTimestamp = Number(endBlockData.timestamp);

  const durationHours = ((endTimestamp - startTimestamp) / 3600).toFixed(1);
  console.log(`Time range: ${durationHours} hours`);

  // Fetch events from subgraph (Borrow/Repay/Liquidate) + RPC (AccrueInterest), or RPC only
  console.log("\nFetching events...");
  const events = useSubgraph
    ? await fetchAllEventsFromSubgraph(client, startBlock, currentBlock, startTimestamp, endTimestamp)
    : await fetchAllEvents(client, startBlock, currentBlock, startTimestamp, endTimestamp);
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
