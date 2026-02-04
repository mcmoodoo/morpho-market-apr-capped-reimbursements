/**
 * Overpayment calculation: replay timeline and accrue only interest above APR cap.
 * See refund-calculation-logic.md.
 */

import { WAD, APR_CAP_PER_SECOND } from "./config.ts";
import type {
  AccrueInterestEvent,
  BorrowEvent,
  RepayEvent,
  LiquidateEvent,
  TimelineEvent,
} from "./types.ts";

/**
 * Calculate overpayments per borrower for the report window [startTimestamp, endTimestamp].
 * Timeline must be sorted by (blockNumber, transactionIndex, logIndex).
 * Returns map: borrower address → overpayment in assets (e.g. USDC).
 */
export function calculateOverpayments(
  timeline: TimelineEvent[],
  startTimestamp: number,
  endTimestamp: number
): Map<string, bigint> {
  const borrowerDebts = new Map<string, bigint>();
  let currentRate = 0n;
  let lastTimestamp = startTimestamp;
  const overpayments = new Map<string, bigint>();

  function accrueSegment(toTimestamp: number): void {
    const segmentStart = Math.max(lastTimestamp, startTimestamp);
    const segmentEnd = Math.min(toTimestamp, endTimestamp);
    const elapsed = segmentEnd - segmentStart;
    lastTimestamp = toTimestamp;

    if (elapsed <= 0) return;

    const elapsedBigInt = BigInt(elapsed);

    if (currentRate > APR_CAP_PER_SECOND) {
      const excessRate = currentRate - APR_CAP_PER_SECOND;
      for (const [borrower, debt] of borrowerDebts) {
        if (debt > 0n) {
          const overpayment =
            (debt * excessRate * elapsedBigInt) / WAD;
          const existing = overpayments.get(borrower) ?? 0n;
          overpayments.set(borrower, existing + overpayment);
        }
      }
    }

    if (currentRate > 0n) {
      for (const [borrower, debt] of borrowerDebts) {
        if (debt > 0n) {
          const interest = (debt * currentRate * elapsedBigInt) / WAD;
          borrowerDebts.set(borrower, debt + interest);
        }
      }
    }
  }

  for (const event of timeline) {
    accrueSegment(event.timestamp);

    switch (event.type) {
      case "accrue":
        currentRate = (event as AccrueInterestEvent).prevBorrowRate;
        break;
      case "borrow": {
        const e = event as BorrowEvent;
        const borrower = e.borrower.toLowerCase();
        const debt = borrowerDebts.get(borrower) ?? 0n;
        borrowerDebts.set(borrower, debt + e.assets);
        break;
      }
      case "repay": {
        const e = event as RepayEvent;
        const borrower = e.borrower.toLowerCase();
        const debtBefore = borrowerDebts.get(borrower) ?? 0n;
        const newDebt = debtBefore > e.assets ? debtBefore - e.assets : 0n;
        borrowerDebts.set(borrower, newDebt);
        break;
      }
      case "liquidate": {
        const e = event as LiquidateEvent;
        const borrower = e.borrower.toLowerCase();
        const debtBefore = borrowerDebts.get(borrower) ?? 0n;
        const newDebt =
          debtBefore > e.repaidAssets ? debtBefore - e.repaidAssets : 0n;
        borrowerDebts.set(borrower, newDebt);
        break;
      }
    }
  }

  accrueSegment(endTimestamp);

  return overpayments;
}
