import { formatUnits } from "viem";
import { MORPHO_BLUE, MARKET_ID, USDC_DECIMALS, APR_CAP_PERCENT } from "./config.ts";
import type { RefundReport, BorrowerRefund } from "./types.ts";

/**
 * Generate a refund report from calculated overpayments
 */
export function generateReport(
  overpayments: Map<string, bigint>,
  startBlock: bigint,
  endBlock: bigint,
  startTimestamp: number,
  endTimestamp: number
): RefundReport {
  // Filter out zero overpayments and format
  const borrowers: BorrowerRefund[] = [];
  let totalOverpayment = 0n;

  for (const [address, amount] of overpayments) {
    if (amount > 0n) {
      borrowers.push({
        address,
        overpayment: formatUnits(amount, USDC_DECIMALS),
      });
      totalOverpayment += amount;
    }
  }

  // Sort by overpayment descending
  borrowers.sort(
    (a, b) => parseFloat(b.overpayment) - parseFloat(a.overpayment)
  );

  return {
    marketId: MARKET_ID,
    chain: "arbitrum-one",
    morphoBlue: MORPHO_BLUE,
    thresholdAprPercent: `${APR_CAP_PERCENT}.0`,
    periodStartBlock: Number(startBlock),
    periodEndBlock: Number(endBlock),
    periodStartTimestamp: startTimestamp,
    periodEndTimestamp: endTimestamp,
    totalOverpayment: formatUnits(totalOverpayment, USDC_DECIMALS),
    borrowerCount: borrowers.length,
    borrowers,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Write a report to disk
 */
export async function writeReport(report: RefundReport): Promise<string> {
  const timestamp = Date.now();
  const filename = `refunds/report-${timestamp}.json`;

  await Bun.write(filename, JSON.stringify(report, null, 2));

  console.log(`Report written to ${filename}`);
  console.log(`Total overpayment: ${report.totalOverpayment} USDC`);
  console.log(`Borrowers affected: ${report.borrowerCount}`);

  return filename;
}
