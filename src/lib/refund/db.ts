/**
 * Simplest DB for storing Morpho events (Borrow, Repay, Liquidate, AccrueInterest).
 * SQLite via Bun, one table, JSON payload. Good for backfill + live sync.
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
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (market_id, block_number, tx_index, log_index)
      )
    `);
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_events_market_block ON events (market_id, block_number)`
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

/** Insert block timestamps (from sync). Idempotent: same block_number is replaced. */
export function insertBlockTimestamps(entries: Iterable<[bigint, number]>): void {
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

/** Get block timestamp from DB, or null if not stored. */
export function getBlockTimestamp(blockNumber: bigint): number | null {
  const d = getDb();
  const row = d
    .query(`SELECT timestamp FROM block_timestamps WHERE block_number = ?`)
    .get(Number(blockNumber)) as { timestamp: number } | undefined;
  return row?.timestamp ?? null;
}

/**
 * Populate block_timestamps from events table payloads (timestamp per block).
 * Idempotent: merges in; existing rows are replaced.
 */
export function populateBlockTimestampsFromEvents(marketId: string): void {
  const d = getDb();
  d.run(
    `INSERT OR REPLACE INTO block_timestamps (block_number, timestamp)
     SELECT block_number, MIN(CAST(json_extract(payload, '$.timestamp') AS INTEGER))
     FROM events WHERE market_id = ? AND json_extract(payload, '$.timestamp') IS NOT NULL
     GROUP BY block_number`,
    marketId.toLowerCase()
  );
}

function eventToPayload(event: TimelineEvent): string {
  return JSON.stringify(event, (_, v) =>
    typeof v === "bigint" ? v.toString() : v
  );
}

/** Insert one event. Idempotent: same (market_id, block, tx_index, log_index) is replaced. */
export function insertEvent(marketId: string, event: TimelineEvent): void {
  const d = getDb();
  d.run(
    `INSERT OR REPLACE INTO events (market_id, block_number, tx_index, log_index, event_type, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
    marketId.toLowerCase(),
    Number(event.blockNumber),
    event.transactionIndex,
    event.logIndex,
    event.type,
    eventToPayload(event)
  );
}

/** Insert many events in one transaction. */
export function insertEvents(marketId: string, events: TimelineEvent[]): void {
  const d = getDb();
  const stmt = d.prepare(
    `INSERT OR REPLACE INTO events (market_id, block_number, tx_index, log_index, event_type, payload)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const market = marketId.toLowerCase();
  d.transaction(() => {
    for (const event of events) {
      stmt.run(
        market,
        Number(event.blockNumber),
        event.transactionIndex,
        event.logIndex,
        event.type,
        eventToPayload(event)
      );
    }
  })();
}

/** Read events for a market in order (for replay). Optionally filter by block range. */
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
  return rows.map((r) => reviveEvent(JSON.parse(r.payload)));
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
    if (k in out && (typeof out[k] === "number" || typeof out[k] === "string"))
      out[k] = BigInt(out[k] as number | string);
  }
  return out as TimelineEvent;
}

/** Highest block_number we have for this market (for incremental sync). */
export function getLastSyncedBlock(marketId: string): bigint | null {
  const d = getDb();
  const row = d
    .query(
      `SELECT MAX(block_number) as max_block FROM events WHERE market_id = ?`
    )
    .get(marketId.toLowerCase()) as { max_block: number | null } | undefined;
  if (row?.max_block == null) return null;
  return BigInt(row.max_block);
}

/** Close the DB (e.g. on process exit). */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
