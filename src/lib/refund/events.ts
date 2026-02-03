import type { PublicClient } from "viem";
import { parseAbiItem } from "viem";
import { MORPHO_BLUE } from "./config.ts";
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

export interface FetchAllEventsResult {
  events: FetchedEvents;
  blockTimestamps: Map<bigint, number>;
}

// Infura eth_getLogs constraints (https://docs.metamask.io/services/reference/ethereum/json-rpc-methods/eth_getlogs):
// - max 10,000 results per query
// - max 10s query duration
// - max 5,000 parameters per request
// Chunk by block range so each request stays under 10k results; 50k blocks (~3.5h on Arbitrum) keeps 4h to ~2 chunks.
const MAX_BLOCKS_PER_GETLOGS = 50_000n;

// Delay between eth_getLogs calls to avoid Infura 429 Too Many Requests (rate limit).
const RPC_DELAY_MS = 400;

// Max batch size for eth_getBlockByNumber batch (Infura may limit request size).
const BLOCK_TIMESTAMPS_BATCH_SIZE = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Batch-fetch block timestamps for a set of block numbers (one HTTP request per chunk).
 * Returns blockNumber -> timestamp (seconds, number).
 */
export async function getBlockTimestamps(
  rpcUrl: string,
  blockNumbers: bigint[],
  chunkSize: number = BLOCK_TIMESTAMPS_BATCH_SIZE
): Promise<Map<bigint, number>> {
  const map = new Map<bigint, number>();
  const unique = [...new Set(blockNumbers)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const idToBlock = new Map<number, bigint>();
    const batch = chunk.map((blockNumber, idx) => {
      const id = i + idx;
      idToBlock.set(id, blockNumber);
      return {
        jsonrpc: "2.0" as const,
        id,
        method: "eth_getBlockByNumber" as const,
        params: ["0x" + blockNumber.toString(16), false],
      };
    });

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`getBlockTimestamps: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as Array<{ id: number; result: { timestamp: string } | null }>;

    for (const item of data) {
      const blockNumber = item?.id != null ? idToBlock.get(item.id) : undefined;
      if (blockNumber != null && item?.result?.timestamp != null) {
        map.set(blockNumber, parseInt(item.result.timestamp, 16));
      }
    }
  }

  return map;
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

export interface FetchAllEventsOptions {
  /** When set, batch-fetch block timestamps and use exact timestamps instead of interpolation. */
  rpcUrl?: string;
  /**
   * When true and using rpcUrl, fall back to interpolated timestamp if a block is missing from the batch response.
   * When false (default), throw if any block timestamp is missing.
   */
  fallbackToInterpolation?: boolean;
}

/**
 * Fetch all relevant events for the market within a block range.
 * Chunks the range so each eth_getLogs stays under Infura limit (10k results, 10s timeout).
 * When options.rpcUrl is set, uses batch-fetched block timestamps; otherwise interpolates.
 */
export async function fetchAllEvents(
  client: PublicClient,
  startBlock: bigint,
  endBlock: bigint,
  startTimestamp: number,
  endTimestamp: number,
  options?: FetchAllEventsOptions
): Promise<FetchAllEventsResult> {
  const accrueRaw: Awaited<ReturnType<PublicClient["getLogs"]>> = [];
  const borrowRaw: typeof accrueRaw = [];
  const repayRaw: typeof accrueRaw = [];
  const liquidateRaw: typeof accrueRaw = [];

  for (const [from, to] of chunkBlockRange(startBlock, endBlock)) {
    const a = await client.getLogs({
      address: MORPHO_BLUE,
      event: ACCRUE_INTEREST_EVENT,
      fromBlock: from,
      toBlock: to,
    });
    await sleep(RPC_DELAY_MS);
    const b = await client.getLogs({
      address: MORPHO_BLUE,
      event: BORROW_EVENT,
      fromBlock: from,
      toBlock: to,
    });
    await sleep(RPC_DELAY_MS);
    const r = await client.getLogs({
      address: MORPHO_BLUE,
      event: REPAY_EVENT,
      fromBlock: from,
      toBlock: to,
    });
    await sleep(RPC_DELAY_MS);
    const l = await client.getLogs({
      address: MORPHO_BLUE,
      event: LIQUIDATE_EVENT,
      fromBlock: from,
      toBlock: to,
    });
    accrueRaw.push(...a);
    borrowRaw.push(...b);
    repayRaw.push(...r);
    liquidateRaw.push(...l);
    await sleep(RPC_DELAY_MS);
  }

  const allBlockNumbers = new Set<bigint>();
  for (const log of [...accrueRaw, ...borrowRaw, ...repayRaw, ...liquidateRaw]) {
    allBlockNumbers.add(log.blockNumber);
  }

  let ts: (blockNumber: bigint) => number;
  const blockTimestamps = new Map<bigint, number>();
  if (options?.rpcUrl && allBlockNumbers.size > 0) {
    const timestampMap = await getBlockTimestamps(options.rpcUrl, [...allBlockNumbers]);
    for (const [block, t] of timestampMap) blockTimestamps.set(block, t);
    const fallback = options.fallbackToInterpolation === true;
    ts = (blockNumber: bigint) => {
      const t = timestampMap.get(blockNumber);
      if (t != null) return t;
      if (fallback) {
        return interpolateTimestamp(blockNumber, startBlock, endBlock, startTimestamp, endTimestamp);
      }
      throw new Error(`Missing block timestamp for block ${blockNumber} (fallbackToInterpolation is disabled)`);
    };
  } else {
    ts = (blockNumber: bigint) =>
      interpolateTimestamp(blockNumber, startBlock, endBlock, startTimestamp, endTimestamp);
  }

  const marketIdStr = (id: unknown): string =>
    typeof id === "string" ? id.toLowerCase() : String(id).toLowerCase();

  const accrue: AccrueInterestEvent[] = accrueRaw.map((log) => ({
    type: "accrue" as const,
    marketId: marketIdStr(log.args.id),
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    transactionHash: log.transactionHash!,
    timestamp: ts(log.blockNumber),
    prevBorrowRate: log.args.prevBorrowRate!,
  }));

  const borrow: BorrowEvent[] = borrowRaw.map((log) => ({
    type: "borrow" as const,
    marketId: marketIdStr(log.args.id),
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    transactionHash: log.transactionHash!,
    timestamp: ts(log.blockNumber),
    borrower: log.args.onBehalf!,
    assets: log.args.assets!,
  }));

  const repay: RepayEvent[] = repayRaw.map((log) => ({
    type: "repay" as const,
    marketId: marketIdStr(log.args.id),
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    transactionHash: log.transactionHash!,
    timestamp: ts(log.blockNumber),
    borrower: log.args.onBehalf!,
    assets: log.args.assets!,
  }));

  const liquidate: LiquidateEvent[] = liquidateRaw.map((log) => ({
    type: "liquidate" as const,
    marketId: marketIdStr(log.args.id),
    blockNumber: log.blockNumber,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    transactionHash: log.transactionHash!,
    timestamp: ts(log.blockNumber),
    borrower: log.args.borrower!,
    repaidAssets: log.args.repaidAssets!,
  }));

  return { events: { accrue, borrow, repay, liquidate }, blockTimestamps };
}
