/**
 * Overpayment report: load events for a market, run calculator, print per-borrower refunds.
 * Always writes JSON to a file; stdout is human table (default) or JSON (--json).
 *
 * Usage:
 *   bun run src/scripts/refund-report.ts --market <id> [--from-block N] [--to-block N] [--output path.json] [--json]
 *
 * Default output file: reports/refund-report.json
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { formatUnits } from "viem";
import { USDC_DECIMALS } from "../lib/refund/config.ts";
import { getEvents } from "../lib/refund/db.ts";
import { calculateOverpayments } from "../lib/refund/calculator.ts";

const DEFAULT_OUTPUT_PATH = "reports/refund-report.json";

function parseArgs(): {
  marketId: string;
  fromBlock: bigint | undefined;
  toBlock: bigint | undefined;
  outputPath: string;
  json: boolean;
} {
  const args = process.argv.slice(2);
  let marketId: string | undefined;
  let fromBlock: bigint | undefined;
  let toBlock: bigint | undefined;
  let outputPath = DEFAULT_OUTPUT_PATH;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--market" && args[i + 1]) {
      marketId = args[++i];
    } else if (args[i] === "--from-block" && args[i + 1]) {
      fromBlock = BigInt(args[++i]);
    } else if (args[i] === "--to-block" && args[i + 1]) {
      toBlock = BigInt(args[++i]);
    } else if (args[i] === "--output" && args[i + 1]) {
      outputPath = args[++i];
    } else if (args[i] === "--json") {
      json = true;
    }
  }

  if (!marketId) {
    console.error("Error: --market <id> is required");
    console.error("Usage: bun run src/scripts/refund-report.ts --market <id> [--from-block N] [--to-block N] [--output path.json] [--json]");
    process.exit(1);
  }

  return { marketId, fromBlock, toBlock, outputPath, json };
}

function formatUsdc(amount: bigint): string {
  return formatUnits(amount, USDC_DECIMALS);
}

async function main() {
  const { marketId, fromBlock, toBlock, outputPath, json } = parseArgs();

  const timeline = await getEvents(marketId, fromBlock, toBlock);
  if (timeline.length === 0) {
    console.error("No events found for market", marketId);
    if (fromBlock !== undefined || toBlock !== undefined) {
      console.error("(with block range:", fromBlock?.toString(), "..", toBlock?.toString(), ")");
    }
    process.exit(1);
  }

  const startTimestamp = Math.min(...timeline.map((e) => e.timestamp));
  const endTimestamp = Math.max(...timeline.map((e) => e.timestamp));

  const overpayments = calculateOverpayments(timeline, startTimestamp, endTimestamp);

  const entries = [...overpayments.entries()]
    .filter(([, amount]) => amount > 0n)
    .sort((a, b) => (a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0));

  const totalOverpayment = entries.reduce((sum, [, amount]) => sum + amount, 0n);

  const report = {
    marketId,
    fromBlock: fromBlock?.toString(),
    toBlock: toBlock?.toString(),
    startTimestamp,
    endTimestamp,
    eventCount: timeline.length,
    borrowerCount: entries.length,
    totalOverpayment: formatUsdc(totalOverpayment),
    borrowers: entries.map(([address, amount]) => ({
      address,
      overpayment: formatUsdc(amount),
    })),
  };

  const reportJson = JSON.stringify(report, null, 2);
  mkdirSync(dirname(outputPath), { recursive: true });
  await Bun.write(outputPath, reportJson);

  if (json) {
    console.log(reportJson);
    return;
  }

  console.log("Overpayment report");
  console.log("==================");
  console.log("Market:", marketId);
  if (fromBlock !== undefined) console.log("From block:", fromBlock.toString());
  if (toBlock !== undefined) console.log("To block:", toBlock.toString());
  console.log("Time window:", new Date(startTimestamp * 1000).toISOString(), "→", new Date(endTimestamp * 1000).toISOString());
  console.log("Events:", timeline.length);
  console.log("Borrowers with overpayment:", entries.length);
  console.log("Total overpayment (USDC):", formatUsdc(totalOverpayment));
  console.log("Report saved:", outputPath);
  console.log("");

  if (entries.length === 0) {
    console.log("No overpayments (rate did not exceed cap in window).");
    return;
  }

  const addrWidth = Math.max(42, ...entries.map(([a]) => a.length));
  console.log("Address".padEnd(addrWidth), "Overpayment (USDC)");
  console.log("-".repeat(addrWidth + 20));
  for (const [address, amount] of entries) {
    console.log(address.padEnd(addrWidth), formatUsdc(amount));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
