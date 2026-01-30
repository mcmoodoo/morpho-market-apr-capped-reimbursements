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

/**
 * Fetch block timestamps for a list of block numbers
 */
async function getBlockTimestamps(
  client: PublicClient,
  blockNumbers: bigint[]
): Promise<Map<bigint, number>> {
  const unique = [...new Set(blockNumbers.map(String))].map(BigInt);
  const timestamps = new Map<bigint, number>();

  // Batch fetch blocks (be mindful of RPC limits)
  const BATCH_SIZE = 100;
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const blocks = await Promise.all(
      batch.map((bn) => client.getBlock({ blockNumber: bn }))
    );
    blocks.forEach((block, idx) => {
      timestamps.set(batch[idx]!, Number(block.timestamp));
    });
  }

  return timestamps;
}

/**
 * Fetch all relevant events for the market within a block range
 */
export async function fetchAllEvents(
  client: PublicClient,
  startBlock: bigint,
  endBlock: bigint
): Promise<FetchedEvents> {
  // Fetch all 4 event types in parallel
  const [accrueRaw, borrowRaw, repayRaw, liquidateRaw] = await Promise.all([
    client.getLogs({
      address: MORPHO_BLUE,
      event: ACCRUE_INTEREST_EVENT,
      args: { id: MARKET_ID },
      fromBlock: startBlock,
      toBlock: endBlock,
    }),
    client.getLogs({
      address: MORPHO_BLUE,
      event: BORROW_EVENT,
      args: { id: MARKET_ID },
      fromBlock: startBlock,
      toBlock: endBlock,
    }),
    client.getLogs({
      address: MORPHO_BLUE,
      event: REPAY_EVENT,
      args: { id: MARKET_ID },
      fromBlock: startBlock,
      toBlock: endBlock,
    }),
    client.getLogs({
      address: MORPHO_BLUE,
      event: LIQUIDATE_EVENT,
      args: { id: MARKET_ID },
      fromBlock: startBlock,
      toBlock: endBlock,
    }),
  ]);

  // Collect all unique block numbers for timestamp fetching
  const allBlockNumbers = [
    ...accrueRaw.map((l) => l.blockNumber),
    ...borrowRaw.map((l) => l.blockNumber),
    ...repayRaw.map((l) => l.blockNumber),
    ...liquidateRaw.map((l) => l.blockNumber),
  ];

  // Fetch timestamps
  const timestamps = await getBlockTimestamps(client, allBlockNumbers);

  // Parse AccrueInterest events
  const accrue: AccrueInterestEvent[] = accrueRaw.map((log) => ({
    type: "accrue" as const,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    timestamp: timestamps.get(log.blockNumber) ?? 0,
    prevBorrowRate: log.args.prevBorrowRate!,
    interest: log.args.interest!,
    feeShares: log.args.feeShares!,
  }));

  // Parse Borrow events
  const borrow: BorrowEvent[] = borrowRaw.map((log) => ({
    type: "borrow" as const,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    timestamp: timestamps.get(log.blockNumber) ?? 0,
    borrower: log.args.onBehalf!,
    assets: log.args.assets!,
    shares: log.args.shares!,
  }));

  // Parse Repay events
  const repay: RepayEvent[] = repayRaw.map((log) => ({
    type: "repay" as const,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    timestamp: timestamps.get(log.blockNumber) ?? 0,
    borrower: log.args.onBehalf!,
    assets: log.args.assets!,
    shares: log.args.shares!,
  }));

  // Parse Liquidate events
  const liquidate: LiquidateEvent[] = liquidateRaw.map((log) => ({
    type: "liquidate" as const,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    timestamp: timestamps.get(log.blockNumber) ?? 0,
    borrower: log.args.borrower!,
    repaidAssets: log.args.repaidAssets!,
    repaidShares: log.args.repaidShares!,
  }));

  return { accrue, borrow, repay, liquidate };
}
