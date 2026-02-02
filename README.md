# rate-rebate

Sync Morpho Blue events (Borrow, Repay, Liquidate, AccrueInterest) for a fixed block range into SQLite.

## Setup

```bash
bun install
```

## Environment

- **INFURA_ARBITRUM_MAINNET_RPC** – Arbitrum One RPC URL.

## Run

```bash
bun run sync
```

Clears the DB, then fetches blocks **427663781 → 427682051** and saves events to `./data/events.db`.
