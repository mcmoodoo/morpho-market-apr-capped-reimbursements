# rate-rebate

Sync Morpho Blue events (Borrow, Repay, Liquidate, AccrueInterest) for a fixed block range into PostgreSQL.

## Setup

```bash
bun install
```

## Environment

- **INFURA_POLYGON_MAINNET_RPC** – Polygon mainnet RPC URL.
- **POSTGRES_URL** or **DATABASE_URL** – PostgreSQL connection string (default: `postgresql://postgres:changeme@localhost:5432/postgres`).

Ensure PostgreSQL is running before `bun run sync` (e.g. `docker start gondor-analytics` or your own Postgres). If you see "Connection closed", the server is likely not reachable—check the URL and that the container/process is up.

## Run

```bash
bun run sync
```

Fetches blocks from a start block to current and saves events to PostgreSQL. Requires a running PostgreSQL instance (see Environment).

## Shortcomings

- estimating refunds using simple interest formula rather than Taylor expansion approximation for continous compounding like Morpho Blue does
- falling back on block timestamp interpolation when rpc omits the block time stamp from the response of eth_getLogs (...block range...)
