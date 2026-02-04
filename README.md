# rate-rebate

Off-chain indexer for Morpho Blue (Polygon): syncs market events to PostgreSQL and computes borrower overpayments (interest above a 1% APR cap). Exposes a read-only JSON API and a React dashboard for markets, overpayments, and events.

**Stack:** Bun, TypeScript, PostgreSQL (Bun.sql), viem, React (dashboard). No separate backend framework; API is `Bun.serve()` in `src/api/index.ts`.

## Video

[![YouTube](https://img.youtube.com/vi/MOT9ZUgJ5ao/maxresdefault.jpg)](https://youtu.be/MOT9ZUgJ5ao)

---

## Requirements

- Bun
- PostgreSQL (for event storage)
- Polygon mainnet RPC (for sync)

---

## Environment

| Variable                         | Purpose                                                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `INFURA_POLYGON_MAINNET_RPC`     | Polygon mainnet RPC URL. Required for `bun run sync`.                                                      |
| `POSTGRES_URL` or `DATABASE_URL` | PostgreSQL connection string. Default: `postgresql://postgres:changethispassword@localhost:5432/postgres`. |

PostgreSQL must be running before running the sync script. Connection is checked at sync start; "Connection closed" usually means the server is unreachable or the URL is wrong.

---

## Commands

| Command                   | Description                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `bun install`             | Install dependencies.                                                                                                      |
| `bun run sync`            | Sync events: resume from last indexed block to chain head, or (if DB empty) backfill from a given start block (see below). |
| `bun run api`             | Start API server (default port 3000; override with `API_PORT`). Serves JSON API and dashboard assets.                      |
| `bun run build:dashboard` | Build dashboard bundle to `src/dashboard/dist/`. Required before `bun run api` if you changed dashboard code.              |
| `bun test`                | Run tests. Calculator unit tests live in `src/lib/refund/calculator.test.ts`.                                              |

**Sync modes:**

- **Resume:** `bun run sync` with no args. Reads max block from DB, fetches from `max+1` to current block. Fails if DB has no events.
- **Backfill:** `bun run sync <startBlock>` or `bun run sync --start-block <startBlock>`. Fetches from `startBlock` to current. Allowed only when DB is empty.

Sync fetches in blocks of 10k with delays (see `CHUNK_BLOCKS`, `RPC_DELAY_MS`, `CHUNK_DELAY_MS` in `src/scripts/sync-events.ts`). Morpho Blue contract address and event ABIs are in `src/lib/refund/config.ts` and `src/lib/refund/events.ts`.

---

## Data model

**Events** are stored per market in PostgreSQL. Each row is one of: `accrue`, `borrow`, `repay`, `liquidate`. Columns include `block_number`, `tx_index`, `log_index`, `timestamp`, `borrower` (for borrow/repay/liquidate), `assets` / `repaid_assets`, `prev_borrow_rate` (accrue). Timeline order is `(block_number, tx_index, log_index)`.

**Block timestamps** are stored in a separate table and filled during sync (batch `eth_getBlockByNumber`). If a block is missing from the batch, sync can fall back to interpolated timestamp between chunk start/end (see `events.ts`).

Asset amounts from the chain (WAD 18 decimals) are converted to 6 decimals (USDC) before being written and used in the calculator.

---

## Refund (overpayment) calculation

Overpayment is the portion of interest that exceeds a **1% APR cap** (per second, in WAD). Logic is in `src/lib/refund/calculator.ts`; step-by-step spec is in `refund-calculation-logic.md`.

- **Inputs:** Sorted timeline of events for a market, and a report window `[startTimestamp, endTimestamp]`.
- **Process:** Replay events in order. For each event, first accrue the segment from `lastTimestamp` to the event’s timestamp (clamped to the report window): if current borrow rate &gt; cap, add `(debt × excessRate × elapsed) / WAD` to each borrower’s overpayment; then update each borrower’s debt with full-rate interest. Then apply the event (accrue → set rate, borrow → add debt, repay/liquidate → subtract debt).
- **Output:** Map of borrower address → overpayment (asset units, 6 decimals), plus counts of distinct borrowers who had debt in at least one segment under cap vs above cap.

Interest within a segment is **simple interest** (`debt * rate * elapsed / WAD`). Morpho uses a compound (Taylor) model; this is an approximation.

Config: `src/lib/refund/config.ts` (`WAD`, `APR_CAP_PERCENT`, `APR_CAP_PER_SECOND`, etc.).

---

## API

Base URL: `http://localhost:3000` (or `API_PORT`). All listed endpoints are GET. Amounts are returned as decimal strings in **asset units (6 decimals)**; divide by 1e6 for USDC.

| Endpoint                           | Query params                                                  | Response                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health`                          | —                                                             | `{ status: "ok" }`                                                                                                                                                                                                                                                              |
| `/config`                          | —                                                             | `{ aprCapPercent: number }` (APR cap used for overpayment).                                                                                                                                                                                                                     |
| `/status/indexer`                  | —                                                             | `{ markets: Array<{ marketId, minBlock, maxBlock, eventCount }> }`.                                                                                                                                                                                                             |
| `/markets`                         | —                                                             | `{ markets: Array<...> }` (same shape as indexer status).                                                                                                                                                                                                                       |
| `/markets/:marketId`               | —                                                             | Single market indexer status or 404.                                                                                                                                                                                                                                            |
| `/markets/:marketId/overpayments`  | `fromTimestamp`, `toTimestamp` (optional, Unix seconds)       | Filter events by timestamp, then run calculator on that window. Returns `marketId`, `startTimestamp`, `endTimestamp`, `eventCount`, `borrowerCount`, `totalOverpayment`, `activeBorrowersUnderCap`, `activeBorrowersAboveCap`, `borrowers: [{ borrowerAddress, overpayment }]`. |
| `/markets/:marketId/events`        | `type`, `fromBlock`, `toBlock`, `limit`, `offset`             | Paginated raw events for the market.                                                                                                                                                                                                                                            |
| `/borrowers/:address/overpayments` | `fromTimestamp`, `toTimestamp`, `marketId` (optional)         | Overpayments for that address across markets (or one market if `marketId` set).                                                                                                                                                                                                 |
| `/borrowers/:address/events`       | `marketId`, `type`, `fromBlock`, `toBlock`, `limit`, `offset` | Paginated events for that borrower.                                                                                                                                                                                                                                             |
| `/analytics/top-borrowers`         | `marketId`, `fromTimestamp`, `toTimestamp`, `limit`           | Top borrowers by overpayment for the market and time window.                                                                                                                                                                                                                    |
| `/analytics/market-summary`        | `fromTimestamp`, `toTimestamp`                                | Per-market overpayment summary for the time window.                                                                                                                                                                                                                             |

Errors: JSON `{ error: string }` with appropriate HTTP status (400, 404, 500).

**Dashboard:** `GET /` or `GET /dashboard` serves `src/dashboard/index.html`. Static assets: `/dashboard/dist/main.js`, `/dashboard/styles.css`. Build with `bun run build:dashboard` before running the API.

---

## Dashboard

React SPA (see `src/dashboard/`): markets list, per-market overpayments and event list, borrower lookup by address, time-range presets (7d, 30d, 90d, all) and custom date range (calendar picker). Uses TanStack Query, Zustand, Radix UI, Tailwind, Recharts. API base URL is the same origin as the page (same server).

---

## Tests

`bun test` runs tests. Currently:

- **`src/lib/refund/calculator.test.ts`** — Unit tests for the overpayment calculator with hand-built timelines. Helpers build `accrue` / `borrow` / `repay` / `liquidate` events; tests cover empty timeline, rate at/above cap, repay and liquidate, report-window clipping, zero elapsed, multiple borrowers. No DB or RPC.

---

## Limitations

- **Interest model:** Simple interest per segment; Morpho Blue uses continuous compounding (Taylor). Refund amounts are approximate.
- **Block timestamps:** If the RPC omits timestamps for some blocks in the batch, the sync can fall back to interpolating between chunk start/end block times (see `events.ts`). Exactness of segment boundaries depends on that.
- **Report window:** Overpayment endpoints filter events by `fromTimestamp`/`toTimestamp`, then set the calculator window to the min/max timestamp of the filtered set. So the effective window is the span of events in range, not necessarily the exact query params.
