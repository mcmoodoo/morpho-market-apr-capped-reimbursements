import { formatUnits } from "viem";
import { MARKET_ID, BLOCKS_PER_24_HOURS, APR_CAP_PERCENT, USDC_DECIMALS } from "../lib/refund/config.ts";
import {
  getBlockTimestamp,
  getEvents,
  getLastSyncedBlock,
  populateBlockTimestampsFromEvents,
} from "../lib/refund/db.ts";
import { calculateOverpayments } from "../lib/refund/calculator.ts";
import { generateReport, writeReport } from "../lib/refund/report.ts";

async function main() {
  // Ensure block_timestamps is populated from events payloads (no RPC)
  populateBlockTimestampsFromEvents(MARKET_ID);

  // Report window: last 24h of synced data
  const endBlock = getLastSyncedBlock(MARKET_ID);
  if (endBlock === null) {
    console.log("No events in DB. Run the sync script first.");
    process.exit(0);
  }

  const startBlock = endBlock - BLOCKS_PER_24_HOURS;
  const timeline = getEvents(MARKET_ID, startBlock, endBlock);
  if (timeline.length === 0) {
    console.log("No events in DB for this range. Run the sync script first.");
    process.exit(0);
  }

  // Use block_timestamps when available; otherwise first/last event timestamp in range
  const startTimestamp =
    getBlockTimestamp(startBlock) ?? timeline[0].timestamp;
  const endTimestamp =
    getBlockTimestamp(endBlock) ?? timeline[timeline.length - 1].timestamp;

  const overpayments = calculateOverpayments(
    timeline,
    startTimestamp,
    endTimestamp
  );

  // Print refunds to stdout
  console.log("Morpho Blue Refund Report");
  console.log("=========================");
  console.log(`Market: ${MARKET_ID}`);
  console.log(`APR Cap: ${APR_CAP_PERCENT}%`);
  console.log(`Block range: ${startBlock} → ${endBlock}`);
  console.log(`Events: ${timeline.length}`);
  console.log("");

  let totalOverpayment = 0n;
  const entries: { address: string; amount: string }[] = [];
  for (const [address, amount] of overpayments) {
    if (amount > 0n) {
      totalOverpayment += amount;
      entries.push({
        address,
        amount: formatUnits(amount, USDC_DECIMALS),
      });
    }
  }
  entries.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));

  console.log(`Total overpayment: ${formatUnits(totalOverpayment, USDC_DECIMALS)} USDC`);
  console.log(`Borrowers with overpayment: ${entries.length}`);
  console.log("");
  if (entries.length > 0) {
    console.log("Refunds by borrower:");
    for (const { address, amount } of entries) {
      console.log(`  ${address}: ${amount} USDC`);
    }
    console.log("");
  }

  const report = generateReport(
    overpayments,
    startBlock,
    endBlock,
    startTimestamp,
    endTimestamp
  );
  await writeReport(report);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
