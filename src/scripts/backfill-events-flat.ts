/**
 * Backfill / rebuild the analytics-friendly events_flat table from raw events.
 *
 * Usage:
 *   bun run src/scripts/backfill-events-flat.ts
 *   # or, via package.json script:
 *   bun run backfill:events-flat
 */

import { rebuildEventsFlat } from "../lib/refund/db.ts";

async function main() {
  console.log("Rebuilding events_flat from events…");
  const startedAt = Date.now();
  rebuildEventsFlat();
  const ms = Date.now() - startedAt;
  console.log(`Done. Rebuilt events_flat in ${ms} ms.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

