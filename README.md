# rate-rebate

Morpho Blue refund indexer: computes hourly overpayments for borrowers when the market rate exceeds an APR cap (e.g. 5%).

## Setup

```bash
bun install
```

## Environment

- **INFURA_ARBITRUM_MAINNET_RPC** (required) – Arbitrum One RPC URL (block range; event logs when not using a subgraph).
- **SUBGRAPH_URL** (optional) – If set, Borrow/Repay/Liquidate come from this endpoint; AccrueInterest still from RPC. **1 subgraph query per run.** Use a subgraph from [The Graph Explorer](https://thegraph.com/explorer) (e.g. ID `8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs`). Query URL format:
  `https://gateway.thegraph.com/api/<YOUR_API_KEY>/subgraphs/id/<SUBGRAPH_ID>`

## Run

```bash
# Using RPC only (default)
bun run refund-indexer

# Using subgraph (set SUBGRAPH_URL first)
SUBGRAPH_URL="https://gateway.thegraph.com/api/..." bun run refund-indexer
```

Or run the script directly:

```bash
bun run src/scripts/refund-indexer.ts
```
