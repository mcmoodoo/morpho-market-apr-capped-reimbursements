#!/usr/bin/env bun
/**
 * Quick viewer for data/events.db. Run: bun run src/scripts/view-db.ts
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

const path = process.env.EVENTS_DB_PATH ?? "./data/events.db";
if (!existsSync(path)) {
  console.error("DB not found:", path);
  process.exit(1);
}
const db = new Database(path, { readonly: true });

const count = db.query("SELECT COUNT(*) as n FROM events").get() as { n: number };
console.log("events:", count.n);

const sample = db.query("SELECT * FROM events ORDER BY block_number LIMIT 5").all();
console.log("\nSample rows:");
console.table(sample);

db.close();
