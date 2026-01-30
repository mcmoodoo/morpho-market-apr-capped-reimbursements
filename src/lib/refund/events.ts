import type { PublicClient } from "viem";
import { parseAbiItem } from "viem";
import { MORPHO_BLUE, MARKET_ID } from "./config.ts";
import type {
  AccrueInterestEvent,
  BorrowEvent,
  RepayEvent,
  LiquidateEvent,
} from "./types.ts";

// Event signatures for parsing
const ACCRUE_INTEREST_EVENT = parseAbiItem(
  "event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)"
);
const BORROW_EVENT = parseAbiItem(
  "event Borrow(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)"
);
const REPAY_EVENT = parseAbiItem(
  "event Repay(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)"
);
const LIQUIDATE_EVENT = parseAbiItem(
  "event Liquidate(bytes32 indexed id, address caller, address indexed borrower, uint256 repaidAssets, uint256 repaidShares, uint256 seizedAssets, uint256 badDebtAssets, uint256 badDebtShares)"
);

export interface FetchedEvents {
  accrue: AccrueInterestEvent[];
  borrow: BorrowEvent[];
  repay: RepayEvent[];
  liquidate: LiquidateEvent[];
}

// Polygon average block time in seconds
const BLOCK_TIME_SECONDS = 2;

/**
 * Estimate timestamp for a block based on current time and block number
 */
function estimateTimestamp(
  blockNumber: bigint,
  endBlock: bigint,
  endTimestamp: number
): number {
  const blocksDiff = Number(endBlock - blockNumber);
  return endTimestamp - blocksDiff * BLOCK_TIME_SECONDS;
}

/**
 * Fetch all relevant events for the market within a block range
 * Timestamps are estimated based on block numbers (no eth_getBlockByNumber calls)
 */
export async function fetchAllEvents(
  client: PublicClient,
  startBlock: bigint,
  endBlock: bigint,
  endTimestamp: number
): Promise<FetchedEvents> {
  // Fetch event types sequentially to avoid rate limits
  const accrueRaw = await client.getLogs({
    address: MORPHO_BLUE,
    event: ACCRUE_INTEREST_EVENT,
    args: { id: MARKET_ID },
    fromBlock: startBlock,
    toBlock: endBlock,
  });

  const borrowRaw = await client.getLogs({
    address: MORPHO_BLUE,
    event: BORROW_EVENT,
    args: { id: MARKET_ID },
    fromBlock: startBlock,
    toBlock: endBlock,
  });

  const repayRaw = await client.getLogs({
    address: MORPHO_BLUE,
    event: REPAY_EVENT,
    args: { id: MARKET_ID },
    fromBlock: startBlock,
    toBlock: endBlock,
  });

  const liquidateRaw = await client.getLogs({
    address: MORPHO_BLUE,
    event: LIQUIDATE_EVENT,
    args: { id: MARKET_ID },
    fromBlock: startBlock,
    toBlock: endBlock,
  });

  const accrue: AccrueInterestEvent[] = accrueRaw.map((log) => ({
    type: "accrue" as const,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    timestamp: estimateTimestamp(log.blockNumber, endBlock, endTimestamp),
    prevBorrowRate: log.args.prevBorrowRate!,
  }));

  const borrow: BorrowEvent[] = borrowRaw.map((log) => ({
    type: "borrow" as const,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    timestamp: estimateTimestamp(log.blockNumber, endBlock, endTimestamp),
    borrower: log.args.onBehalf!,
    assets: log.args.assets!,
  }));

  const repay: RepayEvent[] = repayRaw.map((log) => ({
    type: "repay" as const,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    timestamp: estimateTimestamp(log.blockNumber, endBlock, endTimestamp),
    borrower: log.args.onBehalf!,
    assets: log.args.assets!,
  }));

  const liquidate: LiquidateEvent[] = liquidateRaw.map((log) => ({
    type: "liquidate" as const,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    timestamp: estimateTimestamp(log.blockNumber, endBlock, endTimestamp),
    borrower: log.args.borrower!,
    repaidAssets: log.args.repaidAssets!,
  }));

  return { accrue, borrow, repay, liquidate };
}
