# rate-rebate

Morpho Blue refund indexer: computes hourly overpayments for borrowers when the market rate exceeds an APR cap (e.g. 5%).

## Setup

```bash
bun install
```

## Environment

- **INFURA_ARBITRUM_MAINNET_RPC** (required) – Arbitrum One RPC URL (block range and event logs).

## Run

```bash
bun run refund-indexer
# or
bun run src/scripts/refund-indexer.ts
```
