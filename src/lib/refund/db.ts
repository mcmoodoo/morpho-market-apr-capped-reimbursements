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
