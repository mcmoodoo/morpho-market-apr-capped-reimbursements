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
        payload TEXT NOT NULL,
        PRIMARY KEY (market_id, block_number, tx_index, log_index)
      )
    `);
    try {
      db.run("ALTER TABLE events ADD COLUMN transaction_hash TEXT");
    } catch {
      /* column may already exist */
    }
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_events_market_block ON events (market_id, block_number)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_events_tx_hash ON events (transaction_hash)`
    );
    db.run(`
      CREATE TABLE IF NOT EXISTS block_timestamps (
        block_number INTEGER PRIMARY KEY,
        timestamp INTEGER NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market_id TEXT NOT NULL,
        from_block INTEGER,
        to_block INTEGER,
        start_timestamp INTEGER NOT NULL,
        end_timestamp INTEGER NOT NULL,
        event_count INTEGER NOT NULL,
        borrower_count INTEGER NOT NULL,
        total_overpayment INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_reports_market_created ON reports (market_id, created_at)`);
    db.run(`
      CREATE TABLE IF NOT EXISTS report_overpayments (
        report_id INTEGER NOT NULL,
        borrower_address TEXT NOT NULL,
        overpayment INTEGER NOT NULL,
        PRIMARY KEY (report_id, borrower_address),
        FOREIGN KEY (report_id) REFERENCES reports (id)
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_report_overpayments_report ON report_overpayments (report_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_report_overpayments_borrower ON report_overpayments (borrower_address)`);
  }
  return db;
}

/** Overpayment amounts stored in micro-USDC (1e6 = 1 USDC). */
export const OVERPAYMENT_DECIMALS = 6;

export interface ReportRow {
  marketId: string;
  fromBlock: number | null;
  toBlock: number | null;
  startTimestamp: number;
  endTimestamp: number;
  eventCount: number;
  borrowerCount: number;
  totalOverpayment: bigint;
}

/**
 * Insert a report row; returns the new report id.
 * totalOverpayment in asset units (e.g. 6 decimals for USDC); stored as integer (micro-USDC).
 */
export function insertReport(row: ReportRow): number {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO reports (market_id, from_block, to_block, start_timestamp, end_timestamp, event_count, borrower_count, total_overpayment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const createdAt = Math.floor(Date.now() / 1000);
  stmt.run(
    row.marketId.toLowerCase(),
    row.fromBlock ?? null,
    row.toBlock ?? null,
    row.startTimestamp,
    row.endTimestamp,
    row.eventCount,
    row.borrowerCount,
    Number(row.totalOverpayment),
    createdAt
  );
  const idRow = d.query(`SELECT last_insert_rowid() AS id`).get() as { id: number };
  return idRow.id;
}

/**
 * Insert overpayment rows for a report. Amounts in asset units (e.g. micro-USDC); stored as integer.
 */
export function insertReportOverpayments(
  reportId: number,
  entries: Array<{ address: string; overpayment: bigint }>
): void {
  if (entries.length === 0) return;
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO report_overpayments (report_id, borrower_address, overpayment)
    VALUES (?, ?, ?)
  `);
  d.transaction(() => {
    for (const { address, overpayment } of entries) {
      stmt.run(reportId, address.toLowerCase(), Number(overpayment));
    }
  })();
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

function eventToPayload(event: TimelineEvent): string {
  return JSON.stringify(event, (_, v) =>
    typeof v === "bigint" ? v.toString() : v
  );
}

export function insertEvents(events: TimelineEvent[]): void {
  const d = getDb();
  const stmt = d.prepare(
    `INSERT OR REPLACE INTO events (market_id, block_number, tx_index, log_index, transaction_hash, event_type, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  d.transaction(() => {
    for (const event of events) {
      stmt.run(
        event.marketId.toLowerCase(),
        Number(event.blockNumber),
        event.transactionIndex,
        event.logIndex,
        event.transactionHash,
        event.type,
        eventToPayload(event)
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

const BIGINT_KEYS = new Set([
  "blockNumber",
  "prevBorrowRate",
  "assets",
  "repaidAssets",
]);

function reviveEvent(obj: Record<string, unknown>): TimelineEvent {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of BIGINT_KEYS) {
    if (k in out && (typeof out[k] === "number" || typeof out[k] === "string")) {
      out[k] = BigInt(out[k] as number | string);
    }
  }
  return out as TimelineEvent;
}

/**
 * Read events for a market in timeline order (block_number, tx_index, log_index).
 * Optional block range filter. Each event's payload includes timestamp from sync.
 */
export function getEvents(
  marketId: string,
  fromBlock?: bigint,
  toBlock?: bigint
): TimelineEvent[] {
  const d = getDb();
  let sql = `SELECT payload FROM events WHERE market_id = ?`;
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

  const rows = d.query(sql).all(...args) as { payload: string }[];
  return rows.map((r) => reviveEvent(JSON.parse(r.payload) as Record<string, unknown>));
}
