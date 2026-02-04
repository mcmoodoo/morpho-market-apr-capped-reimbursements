/**
 * SQLite DB for Morpho events (Borrow, Repay, Liquidate, AccrueInterest).
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import type { TimelineEvent } from "./types.ts";

const DB_PATH = process.env.EVENTS_DB_PATH ?? "./data/events.db";

let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH, { create: true });
    db.run(`
      CREATE TABLE IF NOT EXISTS events (
        market_id TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        tx_index INTEGER NOT NULL,
        log_index INTEGER NOT NULL,
        transaction_hash TEXT,
        event_type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        borrower TEXT,
        assets INTEGER,
        repaid_assets INTEGER,
        prev_borrow_rate INTEGER,
        PRIMARY KEY (market_id, block_number, tx_index, log_index)
      )
    `);
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_events_market_block ON events (market_id, block_number)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_events_type_borrower ON events (event_type, borrower)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_events_type_timestamp ON events (event_type, timestamp)`
    );
    db.run(`
      CREATE TABLE IF NOT EXISTS block_timestamps (
        block_number INTEGER PRIMARY KEY,
        timestamp INTEGER NOT NULL
      )
    `);
  }
  return db;
}

/** Overpayment amounts stored in micro-USDC (1e6 = 1 USDC). */
export const OVERPAYMENT_DECIMALS = 6;

/** Get all distinct market IDs from events table, ordered alphabetically. */
export function getMarkets(): string[] {
  const d = getDb();
  const rows = d.query(`SELECT DISTINCT market_id FROM events ORDER BY market_id`).all() as Array<{ market_id: string }>;
  return rows.map((r) => r.market_id);
}

/** Max block_number in events table (any market), or null if empty. */
export function getMaxBlockInEvents(): bigint | null {
  const d = getDb();
  const row = d.query(`SELECT MAX(block_number) AS max_block FROM events`).get() as
    | { max_block: number | null }
    | undefined;
  if (row?.max_block == null) return null;
  return BigInt(row.max_block);
}

/** Clear all events and block_timestamps. Call before each sync. */
export function clearDb(): void {
  const d = getDb();
  d.run("DELETE FROM events");
  d.run("DELETE FROM block_timestamps");
}

export function insertEvents(events: TimelineEvent[]): void {
  const d = getDb();
  const stmt = d.prepare(
    `INSERT OR REPLACE INTO events (
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
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  d.transaction(() => {
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

      stmt.run(
        event.marketId.toLowerCase(),
        Number(event.blockNumber),
        event.transactionIndex,
        event.logIndex,
        event.transactionHash,
        event.type,
        event.timestamp,
        borrower,
        assets == null ? null : Number(assets),
        repaidAssets == null ? null : Number(repaidAssets),
        prevBorrowRate == null ? null : Number(prevBorrowRate)
      );
    }
  })();
}

export function insertBlockTimestamps(
  entries: Iterable<[bigint, number]>
): void {
  const d = getDb();
  const stmt = d.prepare(
    `INSERT OR REPLACE INTO block_timestamps (block_number, timestamp) VALUES (?, ?)`
  );
  d.transaction(() => {
    for (const [blockNumber, timestamp] of entries) {
      stmt.run(Number(blockNumber), timestamp);
    }
  })();
}

/**
 * Read events for a market in timeline order (block_number, tx_index, log_index).
 * Optional block range filter.
 */
export function getEvents(
  marketId: string,
  fromBlock?: bigint,
  toBlock?: bigint
): TimelineEvent[] {
  const d = getDb();
  let sql = `SELECT block_number, tx_index, log_index, transaction_hash, event_type, timestamp, borrower, assets, repaid_assets, prev_borrow_rate FROM events WHERE market_id = ?`;
  const args: (string | number)[] = [marketId.toLowerCase()];
  if (fromBlock !== undefined) {
    sql += ` AND block_number >= ?`;
    args.push(Number(fromBlock));
  }
  if (toBlock !== undefined) {
    sql += ` AND block_number <= ?`;
    args.push(Number(toBlock));
  }
  sql += ` ORDER BY block_number, tx_index, log_index`;

  const rows = d
    .query(sql)
    .all(...args) as Array<{
    block_number: number;
    tx_index: number;
    log_index: number;
    transaction_hash: string | null;
    event_type: string;
    timestamp: number;
    borrower: string | null;
    assets: number | null;
    repaid_assets: number | null;
    prev_borrow_rate: number | null;
  }>;

  const out: TimelineEvent[] = [];
  for (const row of rows) {
    const common = {
      marketId: marketId.toLowerCase(),
      blockNumber: BigInt(row.block_number),
      transactionIndex: row.tx_index,
      logIndex: row.log_index,
      transactionHash: row.transaction_hash ?? "",
      timestamp: row.timestamp,
    } as const;

    switch (row.event_type) {
      case "borrow":
        out.push({
          type: "borrow",
          ...common,
          borrower: row.borrower ?? "",
          assets: row.assets != null ? BigInt(row.assets) : 0n,
        });
        break;
      case "repay":
        out.push({
          type: "repay",
          ...common,
          borrower: row.borrower ?? "",
          assets: row.assets != null ? BigInt(row.assets) : 0n,
        });
        break;
      case "liquidate":
        out.push({
          type: "liquidate",
          ...common,
          borrower: row.borrower ?? "",
          repaidAssets: row.repaid_assets != null ? BigInt(row.repaid_assets) : 0n,
        });
        break;
      case "accrue":
      default:
        out.push({
          type: "accrue",
          ...common,
          prevBorrowRate: row.prev_borrow_rate != null ? BigInt(row.prev_borrow_rate) : 0n,
        });
        break;
    }
  }

  return out;
}
