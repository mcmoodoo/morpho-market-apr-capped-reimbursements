# rate-rebate

Sync Morpho Blue events (Borrow, Repay, Liquidate, AccrueInterest) for a fixed block range into SQLite.

## Setup

```bash
bun install
```

## Environment

- **INFURA_POLYGON_MAINNET_RPC** – Polygon mainnet RPC URL.

## Run

```bash
bun run sync
```

Clears the DB, then fetches blocks **427663781 → 427682051** and saves events to `./data/events.db`.

## Shortcomings

- estimating refunds using simple interest formula rather than Taylor expansion approximation for continous compounding like Morpho Blue does
- falling back on block timestamp interpolation when rpc omits the block time stamp from the response of eth_getLogs (...block range...)
