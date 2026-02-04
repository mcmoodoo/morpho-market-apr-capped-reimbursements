/**
 * PostgreSQL DB for Morpho events (Borrow, Repay, Liquidate, AccrueInterest).
 */

import { SQL } from "bun";
import type { TimelineEvent } from "./types.ts";

const POSTGRES_URL = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "postgresql://postgres:changethispassword@localhost:5432/postgres";

let sql: SQL | null = null;
let schemaInitialized = false;

/**
 * Verify PostgreSQL is reachable. Call early in scripts to fail fast with a clear message.
 * Uses the same connection as the rest of the app (getDb).
 */
export async function checkPostgresConnection(): Promise<void> {
  try {
    const db = await getDb();
    await db`SELECT 1 as ok`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const hint =
      "Is PostgreSQL running? (e.g. docker start gondor-analytics). " +
      "Check POSTGRES_URL or DATABASE_URL.";
    throw new Error(`PostgreSQL connection failed: ${msg}. ${hint}`, { cause: err });
  }
}

async function initSchema(db: SQL): Promise<void> {
  // Create schema. assets/repaid_assets/prev_borrow_rate are TEXT because chain uses uint256
  // and values can exceed PostgreSQL BIGINT (64-bit).
  await db`CREATE TABLE IF NOT EXISTS events (
    market_id TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    tx_index INTEGER NOT NULL,
    log_index INTEGER NOT NULL,
    transaction_hash TEXT,
    event_type TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    borrower TEXT,
    assets TEXT,
    repaid_assets TEXT,
    prev_borrow_rate TEXT,
    PRIMARY KEY (market_id, block_number, tx_index, log_index)
  )`;
  // Migrate existing BIGINT columns to TEXT if present (safe no-op when already TEXT).
  try {
    await db.unsafe("ALTER TABLE events ALTER COLUMN assets TYPE TEXT USING assets::text");
    await db.unsafe("ALTER TABLE events ALTER COLUMN repaid_assets TYPE TEXT USING repaid_assets::text");
    await db.unsafe("ALTER TABLE events ALTER COLUMN prev_borrow_rate TYPE TEXT USING prev_borrow_rate::text");
  } catch {
    // Table may not exist yet or columns already TEXT
  }
  await db`CREATE INDEX IF NOT EXISTS idx_events_market_block ON events (market_id, block_number)`;
  await db`CREATE INDEX IF NOT EXISTS idx_events_type_borrower ON events (event_type, borrower)`;
  await db`CREATE INDEX IF NOT EXISTS idx_events_type_timestamp ON events (event_type, timestamp)`;
  await db`CREATE TABLE IF NOT EXISTS block_timestamps (
    block_number BIGINT PRIMARY KEY,
    timestamp BIGINT NOT NULL
  )`;
}

async function getDb(): Promise<SQL> {
  if (!sql) {
    sql = new SQL(POSTGRES_URL);
  }
  if (!schemaInitialized) {
    await initSchema(sql);
    schemaInitialized = true;
  }
  return sql;
}

/** Overpayment amounts stored in micro-USDC (1e6 = 1 USDC). */
export const OVERPAYMENT_DECIMALS = 6;

/** Get all distinct market IDs from events table, ordered alphabetically. */
export async function getMarkets(): Promise<string[]> {
  const db = await getDb();
  const rows = await db`SELECT DISTINCT market_id FROM events ORDER BY market_id` as Array<{ market_id: string }>;
  return rows.map((r) => r.market_id);
}

export interface MarketIndexerStatus {
  marketId: string;
  minBlock: number | null;
  maxBlock: number | null;
  minTimestamp: number | null;
  maxTimestamp: number | null;
  eventCount: number;
}

/** Get basic indexer coverage stats per market from events table. */
export async function getIndexerStatus(): Promise<MarketIndexerStatus[]> {
  const db = await getDb();
  const rows = await db`
    SELECT market_id,
           MIN(block_number)    AS min_block,
           MAX(block_number)    AS max_block,
           MIN(timestamp)       AS min_ts,
           MAX(timestamp)       AS max_ts,
           COUNT(*)             AS event_count
    FROM events
    GROUP BY market_id
    ORDER BY market_id
  ` as Array<{
    market_id: string;
    min_block: bigint | number | null;
    max_block: bigint | number | null;
    min_ts: bigint | number | null;
    max_ts: bigint | number | null;
    event_count: bigint | number;
  }>;
  return rows.map((r) => ({
    marketId: r.market_id,
    minBlock: r.min_block != null ? Number(r.min_block) : null,
    maxBlock: r.max_block != null ? Number(r.max_block) : null,
    minTimestamp: r.min_ts != null ? Number(r.min_ts) : null,
    maxTimestamp: r.max_ts != null ? Number(r.max_ts) : null,
    eventCount: Number(r.event_count ?? 0),
  }));
}

/** Max block_number in events table (any market), or null if empty. */
export async function getMaxBlockInEvents(): Promise<bigint | null> {
  const db = await getDb();
  const [row] = await db`SELECT MAX(block_number) AS max_block FROM events` as Array<{ max_block: bigint | number | null }>;
  if (row?.max_block == null) return null;
  return BigInt(row.max_block);
}

/** Clear all events and block_timestamps. Call before each sync. */
export async function clearDb(): Promise<void> {
  const db = await getDb();
  await db.unsafe("DELETE FROM events");
  await db.unsafe("DELETE FROM block_timestamps");
}

export async function insertEvents(events: TimelineEvent[]): Promise<void> {
  const db = await getDb();
  if (events.length === 0) return;

  await db.begin(async (tx) => {
    for (const event of events) {
      let borrower: string | null = null;
      let assets: bigint | null = null;
      let repaidAssets: bigint | null = null;
      let prevBorrowRate: bigint | null = null;

      switch (event.type) {
        case "borrow":
          borrower = event.borrower;
          assets = event.assets;
          break;
        case "repay":
          borrower = event.borrower;
          assets = event.assets;
          break;
        case "liquidate":
          borrower = event.borrower;
          repaidAssets = event.repaidAssets;
          break;
        case "accrue":
          prevBorrowRate = event.prevBorrowRate;
          break;
      }

      await tx`
        INSERT INTO events (
          market_id,
          block_number,
          tx_index,
          log_index,
          transaction_hash,
          event_type,
          timestamp,
          borrower,
          assets,
          repaid_assets,
          prev_borrow_rate
        ) VALUES (
          ${event.marketId.toLowerCase()},
          ${Number(event.blockNumber)},
          ${event.transactionIndex},
          ${event.logIndex},
          ${event.transactionHash},
          ${event.type},
          ${event.timestamp},
          ${borrower},
          ${assets != null ? assets.toString() : null},
          ${repaidAssets != null ? repaidAssets.toString() : null},
          ${prevBorrowRate != null ? prevBorrowRate.toString() : null}
        )
        ON CONFLICT (market_id, block_number, tx_index, log_index) 
        DO UPDATE SET
          transaction_hash = EXCLUDED.transaction_hash,
          event_type = EXCLUDED.event_type,
          timestamp = EXCLUDED.timestamp,
          borrower = EXCLUDED.borrower,
          assets = EXCLUDED.assets,
          repaid_assets = EXCLUDED.repaid_assets,
          prev_borrow_rate = EXCLUDED.prev_borrow_rate
      `;
    }
  });
}

export async function insertBlockTimestamps(
  entries: Iterable<[bigint, number]>
): Promise<void> {
  const db = await getDb();
  await db.begin(async (tx) => {
    for (const [blockNumber, timestamp] of entries) {
      await tx`
        INSERT INTO block_timestamps (block_number, timestamp) 
        VALUES (${Number(blockNumber)}, ${timestamp})
        ON CONFLICT (block_number) DO UPDATE SET timestamp = EXCLUDED.timestamp
      `;
    }
  });
}

/**
 * Read events for a market in timeline order (block_number, tx_index, log_index).
 * Optional block range filter.
 */
export async function getEvents(
  marketId: string,
  fromBlock?: bigint,
  toBlock?: bigint
): Promise<TimelineEvent[]> {
  const db = await getDb();
  let query;
  if (fromBlock !== undefined && toBlock !== undefined) {
    query = db`
      SELECT block_number, tx_index, log_index, transaction_hash, event_type, timestamp, borrower, assets, repaid_assets, prev_borrow_rate 
      FROM events 
      WHERE market_id = ${marketId.toLowerCase()} 
        AND block_number >= ${Number(fromBlock)} 
        AND block_number <= ${Number(toBlock)}
      ORDER BY block_number, tx_index, log_index
    `;
  } else if (fromBlock !== undefined) {
    query = db`
      SELECT block_number, tx_index, log_index, transaction_hash, event_type, timestamp, borrower, assets, repaid_assets, prev_borrow_rate 
      FROM events 
      WHERE market_id = ${marketId.toLowerCase()} 
        AND block_number >= ${Number(fromBlock)}
      ORDER BY block_number, tx_index, log_index
    `;
  } else if (toBlock !== undefined) {
    query = db`
      SELECT block_number, tx_index, log_index, transaction_hash, event_type, timestamp, borrower, assets, repaid_assets, prev_borrow_rate 
      FROM events 
      WHERE market_id = ${marketId.toLowerCase()} 
        AND block_number <= ${Number(toBlock)}
      ORDER BY block_number, tx_index, log_index
    `;
  } else {
    query = db`
      SELECT block_number, tx_index, log_index, transaction_hash, event_type, timestamp, borrower, assets, repaid_assets, prev_borrow_rate 
      FROM events 
      WHERE market_id = ${marketId.toLowerCase()}
      ORDER BY block_number, tx_index, log_index
    `;
  }

  const rows = await query as Array<{
    block_number: bigint | number;
    tx_index: number;
    log_index: number;
    transaction_hash: string | null;
    event_type: string;
    timestamp: bigint | number;
    borrower: string | null;
    assets: string | null;
    repaid_assets: string | null;
    prev_borrow_rate: string | null;
  }>;

  const out: TimelineEvent[] = [];
  for (const row of rows) {
    const common = {
      marketId: marketId.toLowerCase(),
      blockNumber: BigInt(row.block_number),
      transactionIndex: row.tx_index,
      logIndex: row.log_index,
      transactionHash: row.transaction_hash ?? "",
      timestamp: Number(row.timestamp),
    } as const;

    switch (row.event_type) {
      case "borrow":
        out.push({
          type: "borrow",
          ...common,
          borrower: row.borrower ?? "",
          assets: row.assets != null && row.assets !== "" ? BigInt(row.assets) : 0n,
        });
        break;
      case "repay":
        out.push({
          type: "repay",
          ...common,
          borrower: row.borrower ?? "",
          assets: row.assets != null && row.assets !== "" ? BigInt(row.assets) : 0n,
        });
        break;
      case "liquidate":
        out.push({
          type: "liquidate",
          ...common,
          borrower: row.borrower ?? "",
          repaidAssets: row.repaid_assets != null && row.repaid_assets !== "" ? BigInt(row.repaid_assets) : 0n,
        });
        break;
      case "accrue":
      default:
        out.push({
          type: "accrue",
          ...common,
          prevBorrowRate: row.prev_borrow_rate != null && row.prev_borrow_rate !== "" ? BigInt(row.prev_borrow_rate) : 0n,
        });
        break;
    }
  }

  return out;
}
