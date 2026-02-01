import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";
import { MARKET_ID, BLOCKS_PER_24_HOURS } from "../lib/refund/config.ts";
import { fetchAllEvents } from "../lib/refund/events.ts";
import { buildTimeline } from "../lib/refund/calculator.ts";
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

  console.log("Morpho Blue Event Sync");
  console.log("======================");
  console.log(`Market: ${MARKET_ID}`);

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

  if (fetchFromBlock > currentBlock) {
    console.log("\nUsing events from DB (range already synced)");
    const timeline = getEvents(MARKET_ID, startBlock, currentBlock);
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
      endTimestamp,
      { rpcUrl: rpc }
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
    console.log(`\nTimeline events: ${dbEvents.length + newTimeline.length} (${dbEvents.length} from DB + ${newTimeline.length} new)`);

    console.log("Saving new events to DB...");
    insertEvents(MARKET_ID, newTimeline);
    console.log(`  Saved ${newTimeline.length} events`);
  }

  console.log("\nSync done.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
