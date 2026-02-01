import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";
import { formatUnits } from "viem";
import { MARKET_ID, BLOCKS_PER_24_HOURS, APR_CAP_PERCENT, USDC_DECIMALS } from "../lib/refund/config.ts";
import { getEvents } from "../lib/refund/db.ts";
import { calculateOverpayments } from "../lib/refund/calculator.ts";
import { generateReport, writeReport } from "../lib/refund/report.ts";

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

  // Block range: last 24 hours (same as sync)
  const currentBlock = await client.getBlockNumber();
  const startBlock = currentBlock - BLOCKS_PER_24_HOURS;

  const [startBlockData, endBlockData] = await Promise.all([
    client.getBlock({ blockNumber: startBlock }),
    client.getBlock({ blockNumber: currentBlock }),
  ]);
  const startTimestamp = Number(startBlockData.timestamp);
  const endTimestamp = Number(endBlockData.timestamp);

  const timeline = getEvents(MARKET_ID, startBlock, currentBlock);
  if (timeline.length === 0) {
    console.log("No events in DB for this range. Run the sync script first.");
    process.exit(0);
  }

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
  console.log(`Block range: ${startBlock} → ${currentBlock}`);
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
    currentBlock,
    startTimestamp,
    endTimestamp
  );
  await writeReport(report);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
