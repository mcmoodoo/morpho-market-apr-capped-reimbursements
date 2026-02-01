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

  // Incremental sync: use DB up to last synced block, fetch only new range from RPC
  const lastSynced = getLastSyncedBlock(MARKET_ID);
  const fetchFromBlock =
    lastSynced === null || lastSynced < startBlock
      ? startBlock
      : lastSynced + 1n;

  let timeline: Awaited<ReturnType<typeof getEvents>>;
  if (fetchFromBlock > currentBlock) {
    console.log("\nUsing events from DB (range already synced)");
    timeline = getEvents(MARKET_ID, startBlock, currentBlock);
    console.log(`  Timeline events: ${timeline.length}`);
  } else {
    const dbEvents =
      lastSynced !== null && lastSynced >= startBlock
        ? getEvents(MARKET_ID, startBlock, lastSynced)
        : [];
    if (dbEvents.length > 0) {
      console.log(`\nUsing events from DB for blocks ${startBlock}..${lastSynced} (${dbEvents.length} events)`);
    }

    const fetchStartBlockData =
      fetchFromBlock > startBlock
        ? await client.getBlock({ blockNumber: fetchFromBlock })
        : startBlockData;
    const fetchStartTimestamp = Number(fetchStartBlockData.timestamp);

    console.log(`\nFetching events from RPC for blocks ${fetchFromBlock}..${currentBlock}`);
    const events = await fetchAllEvents(
      client,
      fetchFromBlock,
      currentBlock,
      fetchStartTimestamp,
      endTimestamp
    );
    console.log(`  AccrueInterest: ${events.accrue.length}`);
    console.log(`  Borrow: ${events.borrow.length}`);
    console.log(`  Repay: ${events.repay.length}`);
    console.log(`  Liquidate: ${events.liquidate.length}`);

    const newTimeline = buildTimeline(
      events.accrue,
      events.borrow,
      events.repay,
      events.liquidate
    );
    timeline = [...dbEvents, ...newTimeline];
    console.log(`\nTimeline events: ${timeline.length} (${dbEvents.length} from DB + ${newTimeline.length} new)`);

    console.log("Saving new events to DB...");
    insertEvents(MARKET_ID, newTimeline);
    console.log(`  Saved ${newTimeline.length} events`);
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
