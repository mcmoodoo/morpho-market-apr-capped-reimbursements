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

// Infura eth_getLogs constraints (https://docs.metamask.io/services/reference/ethereum/json-rpc-methods/eth_getlogs):
// - max 10,000 results per query
// - max 10s query duration
// - max 5,000 parameters per request
// Chunk by block range so each request stays under 10k results; 50k blocks (~3.5h on Arbitrum) keeps 24h to ~7 chunks.
const MAX_BLOCKS_PER_GETLOGS = 50_000n;

// Delay between eth_getLogs calls to avoid Infura 429 Too Many Requests (rate limit).
const RPC_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function* chunkBlockRange(startBlock: bigint, endBlock: bigint): Generator<[bigint, bigint]> {
  let from = startBlock;
  while (from <= endBlock) {
    const to = from + MAX_BLOCKS_PER_GETLOGS - 1n > endBlock ? endBlock : from + MAX_BLOCKS_PER_GETLOGS - 1n;
    yield [from, to];
    from = to + 1n;
  }
}

/**
 * Interpolate event timestamp from block number using real start/end block timestamps.
 * Keeps ordering and proportional elapsed time without per-block RPC calls.
 */
function interpolateTimestamp(
  blockNumber: bigint,
  startBlock: bigint,
  endBlock: bigint,
  startTimestamp: number,
  endTimestamp: number
): number {
  if (startBlock === endBlock) return startTimestamp;
  const t =
    (Number(blockNumber - startBlock) / Number(endBlock - startBlock)) *
    (endTimestamp - startTimestamp);
  return startTimestamp + Math.round(t);
}

/**
 * Fetch all relevant events for the market within a block range.
 * Chunks the range so each eth_getLogs stays under Infura limit (10k results, 10s timeout).
 * Event timestamps are interpolated from block number using real start/end block timestamps.
 */
export async function fetchAllEvents(
  client: PublicClient,
  startBlock: bigint,
  endBlock: bigint,
  startTimestamp: number,
  endTimestamp: number
): Promise<FetchedEvents> {
  const accrueRaw: Awaited<ReturnType<PublicClient["getLogs"]>> = [];
  const borrowRaw: typeof accrueRaw = [];
  const repayRaw: typeof accrueRaw = [];
  const liquidateRaw: typeof accrueRaw = [];

  for (const [from, to] of chunkBlockRange(startBlock, endBlock)) {
    const a = await client.getLogs({
      address: MORPHO_BLUE,
      event: ACCRUE_INTEREST_EVENT,
      args: { id: MARKET_ID },
      fromBlock: from,
      toBlock: to,
    });
    await sleep(RPC_DELAY_MS);
    const b = await client.getLogs({
      address: MORPHO_BLUE,
      event: BORROW_EVENT,
      args: { id: MARKET_ID },
      fromBlock: from,
      toBlock: to,
    });
    await sleep(RPC_DELAY_MS);
    const r = await client.getLogs({
      address: MORPHO_BLUE,
      event: REPAY_EVENT,
      args: { id: MARKET_ID },
      fromBlock: from,
      toBlock: to,
    });
    await sleep(RPC_DELAY_MS);
    const l = await client.getLogs({
      address: MORPHO_BLUE,
      event: LIQUIDATE_EVENT,
      args: { id: MARKET_ID },
      fromBlock: from,
      toBlock: to,
    });
    accrueRaw.push(...a);
    borrowRaw.push(...b);
    repayRaw.push(...r);
    liquidateRaw.push(...l);
    await sleep(RPC_DELAY_MS);
  }

  const ts = (blockNumber: bigint) =>
    interpolateTimestamp(blockNumber, startBlock, endBlock, startTimestamp, endTimestamp);

  const accrue: AccrueInterestEvent[] = accrueRaw.map((log) => ({
    type: "accrue" as const,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    timestamp: ts(log.blockNumber),
    prevBorrowRate: log.args.prevBorrowRate!,
  }));

  const borrow: BorrowEvent[] = borrowRaw.map((log) => ({
    type: "borrow" as const,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    timestamp: ts(log.blockNumber),
    borrower: log.args.onBehalf!,
    assets: log.args.assets!,
  }));

  const repay: RepayEvent[] = repayRaw.map((log) => ({
    type: "repay" as const,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    timestamp: ts(log.blockNumber),
    borrower: log.args.onBehalf!,
    assets: log.args.assets!,
  }));

  const liquidate: LiquidateEvent[] = liquidateRaw.map((log) => ({
    type: "liquidate" as const,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    timestamp: ts(log.blockNumber),
    borrower: log.args.borrower!,
    repaidAssets: log.args.repaidAssets!,
  }));

  return { accrue, borrow, repay, liquidate };
}

/**
 * Fetch only AccrueInterest events. Chunks the range so each eth_getLogs
 * stays under Infura limit (10k results, 10s timeout).
 */
export async function fetchAccrueInterestOnly(
  client: PublicClient,
  startBlock: bigint,
  endBlock: bigint,
  startTimestamp: number,
  endTimestamp: number
): Promise<AccrueInterestEvent[]> {
  const accrueRaw: Awaited<ReturnType<PublicClient["getLogs"]>> = [];
  for (const [from, to] of chunkBlockRange(startBlock, endBlock)) {
    const logs = await client.getLogs({
      address: MORPHO_BLUE,
      event: ACCRUE_INTEREST_EVENT,
      args: { id: MARKET_ID },
      fromBlock: from,
      toBlock: to,
    });
    accrueRaw.push(...logs);
    await sleep(RPC_DELAY_MS);
  }
  const ts = (blockNumber: bigint) =>
    interpolateTimestamp(blockNumber, startBlock, endBlock, startTimestamp, endTimestamp);
  return accrueRaw.map((log) => ({
    type: "accrue" as const,
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    timestamp: ts(log.blockNumber),
    prevBorrowRate: log.args.prevBorrowRate!,
  }));
}
