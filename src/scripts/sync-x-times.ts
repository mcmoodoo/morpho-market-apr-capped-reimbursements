#!/usr/bin/env bun
/**
 * Run sync-events with -f (fallbackToInterpolation) X times in sequence.
 * Usage: bun run sync-x-times <count> [delay_seconds]
 *   count: number of runs (required)
 *   delay_seconds: pause in seconds between runs (optional, default 0)
 */

const rawCount = process.argv[2];
const rawDelay = process.argv[3];
const x = rawCount != null ? parseInt(rawCount, 10) : NaN;
const times = Number.isNaN(x) || x < 1 ? 1 : x;
const delaySec = rawDelay != null ? parseInt(rawDelay, 10) : 0;
const delayMs = Number.isNaN(delaySec) || delaySec < 0 ? 0 : delaySec * 1000;

if (process.argv[2] != null && times === 1 && rawCount !== "1") {
  console.error("Invalid count, using 1. Usage: bun run sync-x-times <count> [delay_seconds]");
}

console.log(`Running sync-events -f ${times} time(s)${delayMs > 0 ? ` with ${delaySec}s pause between runs` : ""}...\n`);

for (let i = 0; i < times; i++) {
  console.log(`--- Run ${i + 1}/${times} ---`);
  const proc = Bun.spawn(["bun", "run", "src/scripts/refund-indexer.ts", "-f"], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  const exit = await proc.exited;
  if (exit !== 0) {
    console.error(`\nSync run ${i + 1} exited with code ${exit}. Stopping.`);
    process.exit(exit);
  }
  if (i < times - 1 && delayMs > 0) {
    console.log(`\nPausing ${delaySec}s...`);
    await Bun.sleep(delayMs);
  }
  console.log("");
}

console.log(`Done. Completed ${times} sync run(s).`);
