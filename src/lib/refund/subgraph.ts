/**
 * Fetch Morpho Blue events from the subgraph on The Graph Explorer.
 *
 * Exactly 1 subgraph query per run: a single GraphQL request fetches
 * market(id) { borrows, repays, liquidates } in one call. AccrueInterest
 * is not in the schema and is fetched from RPC only (no extra subgraph usage).
 *
 * Uses the Morpho Blue (Messari) schema. Set SUBGRAPH_URL to your subgraph
 * GraphQL endpoint. Subgraph ID: 8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs
 */

import type { PublicClient } from "viem";
import { MARKET_ID } from "./config.ts";
import { fetchAccrueInterestOnly } from "./events.ts";
import type { FetchedEvents } from "./events.ts";
import type { BorrowEvent, RepayEvent, LiquidateEvent } from "./types.ts";

export type { FetchedEvents } from "./events.ts";

// Morpho Blue (Messari) schema: market(id) { borrows, repays, liquidates }
// Fields: blockNumber, timestamp, logIndex, nonce; account { id }, amount; liquidatee { id }, repaid
const REFUND_EVENTS_QUERY = `
  query RefundEvents($marketId: Bytes!, $blockFrom: BigInt!, $blockTo: BigInt!) {
    market(id: $marketId) {
      borrows(
        where: { blockNumber_gte: $blockFrom, blockNumber_lte: $blockTo }
        orderBy: blockNumber
        orderDirection: asc
      ) {
        id
        blockNumber
        timestamp
        logIndex
        nonce
        account { id }
        amount
        shares
      }
      repays(
        where: { blockNumber_gte: $blockFrom, blockNumber_lte: $blockTo }
        orderBy: blockNumber
        orderDirection: asc
      ) {
        id
        blockNumber
        timestamp
        logIndex
        nonce
        account { id }
        amount
        shares
      }
      liquidates(
        where: { blockNumber_gte: $blockFrom, blockNumber_lte: $blockTo }
        orderBy: blockNumber
        orderDirection: asc
      ) {
        id
        blockNumber
        timestamp
        logIndex
        nonce
        liquidatee { id }
        repaid
        amount
      }
    }
  }
`;

interface SubgraphBorrow {
  id: string;
  blockNumber: string | number;
  timestamp: string | number;
  logIndex: number | string;
  nonce: string | number;
  account: { id: string };
  amount: string;
  shares?: string;
}

interface SubgraphRepay {
  id: string;
  blockNumber: string | number;
  timestamp: string | number;
  logIndex: number | string;
  nonce: string | number;
  account: { id: string };
  amount: string;
  shares?: string;
}

interface SubgraphLiquidate {
  id: string;
  blockNumber: string | number;
  timestamp: string | number;
  logIndex: number | string;
  nonce: string | number;
  liquidatee: { id: string };
  repaid: string;
  amount?: string;
}

interface RefundEventsResponse {
  data?: {
    market?: {
      borrows?: SubgraphBorrow[];
      repays?: SubgraphRepay[];
      liquidates?: SubgraphLiquidate[];
    };
  };
  errors?: Array<{ message: string }>;
}

function toBigInt(value: string | number): bigint {
  if (typeof value === "number") return BigInt(value);
  return BigInt(value);
}

function toNumber(value: string | number): number {
  if (typeof value === "number") return value;
  return Number(value);
}

// Messari schema has no transactionIndex; use 0 so timeline sorts by blockNumber then logIndex
function mapBorrow(r: SubgraphBorrow): BorrowEvent {
  return {
    type: "borrow",
    blockNumber: BigInt(r.blockNumber),
    transactionIndex: 0,
    logIndex: toNumber(r.logIndex),
    timestamp: toNumber(r.timestamp),
    borrower: r.account.id.toLowerCase(),
    assets: toBigInt(r.amount),
  };
}

function mapRepay(r: SubgraphRepay): RepayEvent {
  return {
    type: "repay",
    blockNumber: BigInt(r.blockNumber),
    transactionIndex: 0,
    logIndex: toNumber(r.logIndex),
    timestamp: toNumber(r.timestamp),
    borrower: r.account.id.toLowerCase(),
    assets: toBigInt(r.amount),
  };
}

function mapLiquidate(r: SubgraphLiquidate): LiquidateEvent {
  return {
    type: "liquidate",
    blockNumber: BigInt(r.blockNumber),
    transactionIndex: 0,
    logIndex: toNumber(r.logIndex),
    timestamp: toNumber(r.timestamp),
    borrower: r.liquidatee.id.toLowerCase(),
    repaidAssets: toBigInt(r.repaid),
  };
}

/**
 * Fetch all events for the refund calculator: Borrow/Repay/Liquidate from
 * the subgraph (Morpho Blue Messari schema), AccrueInterest from RPC (schema
 * does not index it). Requires SUBGRAPH_URL and a PublicClient for RPC.
 */
export async function fetchAllEventsFromSubgraph(
  client: PublicClient,
  startBlock: bigint,
  endBlock: bigint,
  startTimestamp: number,
  endTimestamp: number
): Promise<FetchedEvents> {
  const url = process.env.SUBGRAPH_URL;
  if (!url) {
    throw new Error(
      "SUBGRAPH_URL is not set. Set it to your subgraph GraphQL endpoint (e.g. from thegraph.com/explorer)."
    );
  }

  // AccrueInterest is not in the subgraph schema; fetch from RPC
  const [accrue, subgraphData] = await Promise.all([
    fetchAccrueInterestOnly(client, startBlock, endBlock, startTimestamp, endTimestamp),
    (async () => {
      const variables = {
        marketId: MARKET_ID.toLowerCase(),
        blockFrom: startBlock.toString(),
        blockTo: endBlock.toString(),
      };
      const body = { query: REFUND_EVENTS_QUERY, variables };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Subgraph request failed: ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as RefundEventsResponse;

      if (json.errors?.length) {
        const msg = json.errors.map((e) => e.message).join("; ");
        throw new Error(`Subgraph errors: ${msg}`);
      }
      return json.data?.market;
    })(),
  ]);

  const market = subgraphData ?? {};
  const borrows = market.borrows ?? [];
  const repays = market.repays ?? [];
  const liquidates = market.liquidates ?? [];

  return {
    accrue,
    borrow: borrows.map((r) => mapBorrow(r)),
    repay: repays.map((r) => mapRepay(r)),
    liquidate: liquidates.map((r) => mapLiquidate(r)),
  };
}
