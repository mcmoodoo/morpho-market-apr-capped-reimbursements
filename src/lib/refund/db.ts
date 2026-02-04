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

/** Full report row as returned from reads (id + created_at + ReportRow fields). Amounts in micro-USDC. */
export interface Report {
  id: number;
  marketId: string;
  fromBlock: number | null;
  toBlock: number | null;
  startTimestamp: number;
  endTimestamp: number;
  eventCount: number;
  borrowerCount: number;
  totalOverpayment: bigint;
  createdAt: number;
}

function rowToReport(row: Record<string, unknown>): Report {
  return {
    id: row.id as number,
    marketId: (row.market_id as string) ?? "",
    fromBlock: (row.from_block as number) ?? null,
    toBlock: (row.to_block as number) ?? null,
    startTimestamp: row.start_timestamp as number,
    endTimestamp: row.end_timestamp as number,
    eventCount: row.event_count as number,
    borrowerCount: row.borrower_count as number,
    totalOverpayment: BigInt((row.total_overpayment as number) ?? 0),
    createdAt: row.created_at as number,
  };
}

/** Get a single report by id, or null if not found. */
export function getReportById(id: number): Report | null {
  const d = getDb();
  const row = d.query(`SELECT * FROM reports WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToReport(row);
}

/** Get the latest report for a market (by created_at desc), or null if none. */
export function getLatestReportForMarket(marketId: string): Report | null {
  const d = getDb();
  const row = d
    .query(`SELECT * FROM reports WHERE market_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(marketId.toLowerCase()) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToReport(row);
}

/** Overpayment row for a report (borrower + amount in micro-USDC). */
export interface ReportOverpaymentRow {
  borrowerAddress: string;
  overpayment: bigint;
}

/** Get all overpayments for a report, ordered by overpayment descending. */
export function getOverpaymentsForReport(reportId: number): ReportOverpaymentRow[] {
  const d = getDb();
  const rows = d
    .query(
      `SELECT borrower_address, overpayment FROM report_overpayments WHERE report_id = ? ORDER BY overpayment DESC`
    )
    .all(reportId) as Array<{ borrower_address: string; overpayment: number }>;
  return rows.map((r) => ({
    borrowerAddress: r.borrower_address,
    overpayment: BigInt(r.overpayment),
  }));
}

/** Per-borrower overpayment with report context (for "all reports where this borrower had overpayment"). */
export interface BorrowerOverpaymentRow {
  reportId: number;
  marketId: string;
  createdAt: number;
  overpayment: bigint;
}

/** Get all overpayments for a borrower across reports, with report metadata. Ordered by created_at desc. */
export function getOverpaymentsByBorrower(borrowerAddress: string): BorrowerOverpaymentRow[] {
  const d = getDb();
  const rows = d
    .query(
      `SELECT r.id AS report_id, r.market_id, r.created_at, o.overpayment
       FROM report_overpayments o
       JOIN reports r ON r.id = o.report_id
       WHERE o.borrower_address = ?
       ORDER BY r.created_at DESC`
    )
    .all(borrowerAddress.toLowerCase()) as Array<{ report_id: number; market_id: string; created_at: number; overpayment: number }>;
  return rows.map((r) => ({
    reportId: r.report_id,
    marketId: r.market_id,
    createdAt: r.created_at,
    overpayment: BigInt(r.overpayment),
  }));
}

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
