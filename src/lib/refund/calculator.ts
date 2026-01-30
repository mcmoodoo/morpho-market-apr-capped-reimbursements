import { WAD, APR_CAP_PER_SECOND } from "./config.ts";
import type {
  AccrueInterestEvent,
  BorrowEvent,
  RepayEvent,
  LiquidateEvent,
  TimelineEvent,
} from "./types.ts";

/**
 * Build a sorted timeline from all event types
 * Sorted by (blockNumber, transactionIndex, logIndex)
 */
export function buildTimeline(
  accrueEvents: AccrueInterestEvent[],
  borrowEvents: BorrowEvent[],
  repayEvents: RepayEvent[],
  liquidateEvents: LiquidateEvent[]
): TimelineEvent[] {
  const all: TimelineEvent[] = [
    ...accrueEvents,
    ...borrowEvents,
    ...repayEvents,
    ...liquidateEvents,
  ];

  return all.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return a.blockNumber < b.blockNumber ? -1 : 1;
    }
    if (a.transactionIndex !== b.transactionIndex) {
      return a.transactionIndex - b.transactionIndex;
    }
    return a.logIndex - b.logIndex;
  });
}

/**
 * Calculate overpayments for each borrower based on the event timeline
 *
 * For each time segment where the rate exceeds the 5% APR cap,
 * we calculate how much extra interest each borrower paid.
 */
export function calculateOverpayments(
  timeline: TimelineEvent[],
  startTimestamp: number,
  endTimestamp: number
): Map<string, bigint> {
  // State tracking
  const borrowerDebts = new Map<string, bigint>(); // address → debt in assets
  let currentRate = 0n; // per-second rate in WAD
  let lastTimestamp = startTimestamp;

  // Overpayment accumulator
  const overpayments = new Map<string, bigint>(); // address → overpayment in assets

  // Helper: accrue overpayments for the time segment
  function accrueSegment(toTimestamp: number) {
    const elapsed = BigInt(toTimestamp - lastTimestamp);
    if (elapsed <= 0n) return;

    // Check if rate exceeds cap
    if (currentRate > APR_CAP_PER_SECOND) {
      const excessRate = currentRate - APR_CAP_PER_SECOND;

      for (const [borrower, debt] of borrowerDebts) {
        if (debt > 0n) {
          // overpayment = debt × excessRate × elapsed / WAD
          const overpayment = (debt * excessRate * elapsed) / WAD;
          const existing = overpayments.get(borrower) ?? 0n;
          overpayments.set(borrower, existing + overpayment);
        }
      }
    }

    // Grow all debts by actual rate (for accurate tracking)
    if (currentRate > 0n) {
      for (const [borrower, debt] of borrowerDebts) {
        if (debt > 0n) {
          const interest = (debt * currentRate * elapsed) / WAD;
          borrowerDebts.set(borrower, debt + interest);
        }
      }
    }

    lastTimestamp = toTimestamp;
  }

  // Process each event
  for (const event of timeline) {
    // Accrue up to this event's timestamp
    accrueSegment(event.timestamp);

    // Process the event
    switch (event.type) {
      case "accrue":
        // Update the rate for the NEXT segment
        // Note: prevBorrowRate is the rate that WAS applied, not the new rate
        // However, for our purposes, we use it as the current rate going forward
        // until the next AccrueInterest event
        currentRate = event.prevBorrowRate;
        break;

      case "borrow": {
        const currentDebt = borrowerDebts.get(event.borrower) ?? 0n;
        borrowerDebts.set(event.borrower, currentDebt + event.assets);
        break;
      }

      case "repay": {
        const debtBefore = borrowerDebts.get(event.borrower) ?? 0n;
        const newDebt =
          debtBefore > event.assets ? debtBefore - event.assets : 0n;
        borrowerDebts.set(event.borrower, newDebt);
        break;
      }

      case "liquidate": {
        const debtBeforeLiq = borrowerDebts.get(event.borrower) ?? 0n;
        const newDebtLiq =
          debtBeforeLiq > event.repaidAssets
            ? debtBeforeLiq - event.repaidAssets
            : 0n;
        borrowerDebts.set(event.borrower, newDebtLiq);
        break;
      }
    }
  }

  // Final accrual from last event to end timestamp
  accrueSegment(endTimestamp);

  return overpayments;
}
