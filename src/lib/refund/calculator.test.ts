/**
 * Unit tests for overpayment calculator with hand-built timelines.
 * See refund-calculation-logic.md and docs/calculation-testing-exploration.md.
 */

import { test, expect } from "bun:test";
import {
  calculateOverpayments,
  calculateOverpaymentsWithStats,
} from "./calculator.ts";
import { WAD, APR_CAP_PER_SECOND } from "./config.ts";
import type { TimelineEvent, AccrueInterestEvent, BorrowEvent, RepayEvent, LiquidateEvent } from "./types.ts";

const MARKET = "0xmarket";
const TX = "0xtx";

let block = 1000;
let txIndex = 0;
let logIndex = 0;

function nextPos() {
  return { blockNumber: BigInt(block++), transactionIndex: txIndex++, logIndex: logIndex++ };
}

function mkAccrue(timestamp: number, prevBorrowRate: bigint): AccrueInterestEvent {
  const pos = nextPos();
  return {
    type: "accrue",
    marketId: MARKET,
    ...pos,
    transactionHash: TX,
    timestamp,
    prevBorrowRate,
  };
}

function mkBorrow(timestamp: number, borrower: string, assets: bigint): BorrowEvent {
  const pos = nextPos();
  return {
    type: "borrow",
    marketId: MARKET,
    ...pos,
    transactionHash: TX,
    timestamp,
    borrower: borrower.toLowerCase(),
    assets,
  };
}

function mkRepay(timestamp: number, borrower: string, assets: bigint): RepayEvent {
  const pos = nextPos();
  return {
    type: "repay",
    marketId: MARKET,
    ...pos,
    transactionHash: TX,
    timestamp,
    borrower: borrower.toLowerCase(),
    assets,
  };
}

function mkLiquidate(timestamp: number, borrower: string, repaidAssets: bigint): LiquidateEvent {
  const pos = nextPos();
  return {
    type: "liquidate",
    marketId: MARKET,
    ...pos,
    transactionHash: TX,
    timestamp,
    borrower: borrower.toLowerCase(),
    repaidAssets,
  };
}

function resetPos() {
  block = 1000;
  txIndex = 0;
  logIndex = 0;
}

test("empty timeline returns empty overpayments and zero counts", () => {
  resetPos();
  const start = 100;
  const end = 200;
  const result = calculateOverpaymentsWithStats([], start, end);
  expect(result.overpayments.size).toBe(0);
  expect(result.activeBorrowersUnderCap).toBe(0);
  expect(result.activeBorrowersAboveCap).toBe(0);
});

test("calculateOverpayments wrapper returns only the map", () => {
  resetPos();
  const map = calculateOverpayments([], 100, 200);
  expect(map).toBeInstanceOf(Map);
  expect(map.size).toBe(0);
});

test("rate at or below cap yields zero overpayment and under-cap count", () => {
  resetPos();
  // Cap is 1% APR per second. Use exactly cap so excess = 0.
  const t0 = 100;
  const t1 = 100 + 86400; // 1 day later
  const timeline: TimelineEvent[] = [
    mkAccrue(t0, APR_CAP_PER_SECOND), // rate = cap
    mkBorrow(t1, "0xborrower", 1_000_000_000n), // 1000 USDC (6 decimals)
  ];
  const start = t0;
  const end = t1 + 86400; // one more day of accrual
  const result = calculateOverpaymentsWithStats(timeline, start, end);
  expect(result.overpayments.size).toBe(0);
  expect(result.activeBorrowersUnderCap).toBe(1);
  expect(result.activeBorrowersAboveCap).toBe(0);
});

test("rate above cap yields overpayment and above-cap count", () => {
  resetPos();
  // 2% APR = 2x cap. Excess = 1x cap per second.
  const rateAboveCap = 2n * APR_CAP_PER_SECOND;
  const t0 = 100;
  const t1 = 200;
  const t2 = 200 + 86400; // 1 day after borrow
  const debt = 1_000_000_000n; // 1000 USDC (6 decimals)
  const elapsed = t2 - t1;
  const expectedOverpayment = (debt * APR_CAP_PER_SECOND * BigInt(elapsed)) / WAD;

  const timeline: TimelineEvent[] = [
    mkAccrue(t0, rateAboveCap),
    mkBorrow(t1, "0xborrower", debt),
  ];
  const result = calculateOverpaymentsWithStats(timeline, t0, t2);
  expect(result.overpayments.get("0xborrower")).toBe(expectedOverpayment);
  expect(result.overpayments.size).toBe(1);
  expect(result.activeBorrowersUnderCap).toBe(0);
  expect(result.activeBorrowersAboveCap).toBe(1);
});

test("repay reduces debt so overpayment accrues only on remaining debt after repay", () => {
  resetPos();
  const rateAboveCap = 2n * APR_CAP_PER_SECOND;
  const t0 = 100;
  const t1 = 200;
  const t2 = 300; // repay half here
  const t3 = 300 + 86400; // then 1 day of accrual on half debt
  const borrowAmount = 1_000_000_000n;
  const repayAmount = 500_000_000n;
  const remainingDebt = borrowAmount - repayAmount;
  const elapsedBeforeRepay = t2 - t1;
  const elapsedAfterRepay = t3 - t2;
  const overpaymentBeforeRepay =
    (borrowAmount * APR_CAP_PER_SECOND * BigInt(elapsedBeforeRepay)) / WAD;
  const overpaymentAfterRepay =
    (remainingDebt * APR_CAP_PER_SECOND * BigInt(elapsedAfterRepay)) / WAD;
  const expectedOverpayment = overpaymentBeforeRepay + overpaymentAfterRepay;

  const timeline: TimelineEvent[] = [
    mkAccrue(t0, rateAboveCap),
    mkBorrow(t1, "0xborrower", borrowAmount),
    mkRepay(t2, "0xborrower", repayAmount),
  ];
  const result = calculateOverpaymentsWithStats(timeline, t0, t3);
  expect(result.overpayments.get("0xborrower")).toBe(expectedOverpayment);
  expect(result.activeBorrowersAboveCap).toBe(1);
});

test("report window clips segment: only accrual inside [start, end] counts", () => {
  resetPos();
  const rateAboveCap = 2n * APR_CAP_PER_SECOND;
  const t0 = 100;
  const t1 = 200;
  const t2 = 200 + 86400; // 1 day
  const debt = 1_000_000_000n;
  // Window [500, t2-3600]: only from 500 to t2-3600 contributes (not full t1->t2)
  const start = 500;
  const end = t2 - 3600;
  const elapsed = end - start;
  const expectedOverpayment = (debt * APR_CAP_PER_SECOND * BigInt(elapsed)) / WAD;

  const timeline: TimelineEvent[] = [
    mkAccrue(t0, rateAboveCap),
    mkBorrow(t1, "0xborrower", debt),
  ];
  const result = calculateOverpaymentsWithStats(timeline, start, end);
  expect(result.overpayments.get("0xborrower")).toBe(expectedOverpayment);
});

test("zero elapsed segment does not accrue", () => {
  resetPos();
  const rateAboveCap = 2n * APR_CAP_PER_SECOND;
  const t = 100;
  const timeline: TimelineEvent[] = [
    mkAccrue(t, rateAboveCap),
    mkBorrow(t, "0xborrower", 1_000_000_000n), // same timestamp: segment length 0
  ];
  const result = calculateOverpaymentsWithStats(timeline, t, t + 1);
  expect(result.overpayments.get("0xborrower")).toBe(0n);
});

test("liquidate reduces debt like repay", () => {
  resetPos();
  const rateAboveCap = 2n * APR_CAP_PER_SECOND;
  const t0 = 100;
  const t1 = 200;
  const t2 = 300;
  const t3 = 300 + 86400;
  const borrowAmount = 1_000_000_000n;
  const repaidAssets = 500_000_000n;
  const remainingDebt = borrowAmount - repaidAssets;
  const elapsedBefore = t2 - t1;
  const elapsedAfter = t3 - t2;
  const expectedOverpayment =
    (borrowAmount * APR_CAP_PER_SECOND * BigInt(elapsedBefore)) / WAD +
    (remainingDebt * APR_CAP_PER_SECOND * BigInt(elapsedAfter)) / WAD;

  const timeline: TimelineEvent[] = [
    mkAccrue(t0, rateAboveCap),
    mkBorrow(t1, "0xborrower", borrowAmount),
    mkLiquidate(t2, "0xborrower", repaidAssets),
  ];
  const result = calculateOverpaymentsWithStats(timeline, t0, t3);
  expect(result.overpayments.get("0xborrower")).toBe(expectedOverpayment);
});

test("multiple borrowers accrue overpayment independently", () => {
  resetPos();
  const rateAboveCap = 2n * APR_CAP_PER_SECOND;
  const t0 = 100;
  const t1 = 200;
  const t2 = 300;
  const t3 = 400;
  const debtA = 1_000_000_000n;
  const debtB = 2_000_000_000n;
  const elapsed1 = t2 - t1;
  const elapsed2 = t3 - t2;
  const overpaymentA1 = (debtA * APR_CAP_PER_SECOND * BigInt(elapsed1)) / WAD;
  const overpaymentB2 = (debtB * APR_CAP_PER_SECOND * BigInt(elapsed2)) / WAD; // B only in second segment
  const overpaymentA2 = (debtA * APR_CAP_PER_SECOND * BigInt(elapsed2)) / WAD;

  const timeline: TimelineEvent[] = [
    mkAccrue(t0, rateAboveCap),
    mkBorrow(t1, "0xalice", debtA),
    mkBorrow(t2, "0xbob", debtB),
  ];
  const result = calculateOverpaymentsWithStats(timeline, t0, t3);
  expect(result.overpayments.get("0xalice")).toBe(overpaymentA1 + overpaymentA2);
  expect(result.overpayments.get("0xbob")).toBe(overpaymentB2);
  expect(result.overpayments.size).toBe(2);
  expect(result.activeBorrowersAboveCap).toBe(2);
});
