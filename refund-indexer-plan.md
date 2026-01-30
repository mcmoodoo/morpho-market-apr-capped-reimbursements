# Refund Indexer Implementation Plan

## Overview

Build an off-chain indexer that calculates hourly interest overpayments for borrowers in a Morpho Blue market on Polygon PoS. Borrowers who paid more than 5% APR are refunded the excess.

**Approach**: Raw viem for event fetching. No Morpho SDK (it doesn't support historical event queries).

---

## Configuration

| Parameter | Value |
|-----------|-------|
| Chain | Polygon PoS (chainId: 137) |
| Morpho Blue | `0x1bF0c2541F820E775182832f06c0B7Fc27A25f67` |
| Market ID | `0x1cfe584af3db05c7f39d60e458a87a8b2f6b5d8c6125631984ec489f1d13553b` |
| RPC | `process.env.INFURA_POLYGON_MAINNET_RPC` |
| APR Cap | 5% (0.05) |
| Scan Range | `currentBlock - 1800` → `currentBlock` (~1 hour) |
| Loan Token | USDC (6 decimals) |
| Output | `refunds/report-{timestamp}.json` |

---

## Morpho Blue ABI (Events Only)

```typescript
const morphoBlueAbi = [
  // AccrueInterest: emitted when interest accrues
  {
    type: "event",
    name: "AccrueInterest",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "prevBorrowRate", type: "uint256", indexed: false },
      { name: "interest", type: "uint256", indexed: false },
      { name: "feeShares", type: "uint256", indexed: false },
    ],
  },
  // Borrow: user increases debt
  {
    type: "event",
    name: "Borrow",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "caller", type: "address", indexed: false },
      { name: "onBehalf", type: "address", indexed: true },
      { name: "receiver", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  // Repay: user decreases debt
  {
    type: "event",
    name: "Repay",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "caller", type: "address", indexed: true },
      { name: "onBehalf", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  // Liquidate: forced debt reduction
  {
    type: "event",
    name: "Liquidate",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "caller", type: "address", indexed: false },
      { name: "borrower", type: "address", indexed: true },
      { name: "repaidAssets", type: "uint256", indexed: false },
      { name: "repaidShares", type: "uint256", indexed: false },
      { name: "seizedAssets", type: "uint256", indexed: false },
      { name: "badDebtAssets", type: "uint256", indexed: false },
      { name: "badDebtShares", type: "uint256", indexed: false },
    ],
  },
] as const;
```

---

## Constants

```typescript
// Math constants
const WAD = 10n ** 18n;                      // 1e18 (Morpho's decimal precision)
const SECONDS_PER_YEAR = 31536000n;          // 365 * 24 * 60 * 60
const USDC_DECIMALS = 6;

// APR cap configuration
const APR_CAP_PERCENT = 5n;                  // 5%
const APR_CAP_WAD = (APR_CAP_PERCENT * WAD) / 100n;  // 0.05 * 1e18 = 5e16
const APR_CAP_PER_SECOND = APR_CAP_WAD / SECONDS_PER_YEAR;  // ~1,585,489,599

// Block range
const BLOCKS_PER_HOUR = 1800n;               // ~2 seconds per block on Polygon

// Addresses
const MORPHO_BLUE = "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67" as const;
const MARKET_ID = "0x1cfe584af3db05c7f39d60e458a87a8b2f6b5d8c6125631984ec489f1d13553b" as const;
```

---

## TypeScript Types

```typescript
// Event types (parsed from logs)
interface AccrueInterestEvent {
  type: "accrue";
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  prevBorrowRate: bigint;  // per-second rate in WAD
  interest: bigint;        // total interest accrued (in assets)
  feeShares: bigint;
}

interface BorrowEvent {
  type: "borrow";
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  borrower: string;        // onBehalf address
  assets: bigint;
  shares: bigint;
}

interface RepayEvent {
  type: "repay";
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  borrower: string;        // onBehalf address
  assets: bigint;
  shares: bigint;
}

interface LiquidateEvent {
  type: "liquidate";
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  borrower: string;
  repaidAssets: bigint;
  repaidShares: bigint;
}

type TimelineEvent = AccrueInterestEvent | BorrowEvent | RepayEvent | LiquidateEvent;

// Output types
interface BorrowerRefund {
  address: string;
  overpayment: string;     // formatted USDC amount
}

interface RefundReport {
  marketId: string;
  chain: string;
  morphoBlue: string;
  thresholdAprPercent: string;
  periodStartBlock: number;
  periodEndBlock: number;
  periodStartTimestamp: number;
  periodEndTimestamp: number;
  totalOverpayment: string;
  borrowerCount: number;
  borrowers: BorrowerRefund[];
  generatedAt: string;
}
```

---

## Algorithm

### Step 1: Setup

```typescript
import { createPublicClient, http, parseAbiItem, formatUnits } from "viem";
import { polygon } from "viem/chains";

const client = createPublicClient({
  chain: polygon,
  transport: http(process.env.INFURA_POLYGON_MAINNET_RPC),
});

// Get block range
const currentBlock = await client.getBlockNumber();
const startBlock = currentBlock - BLOCKS_PER_HOUR;
const endBlock = currentBlock;

// Get timestamps for start and end blocks
const [startBlockData, endBlockData] = await Promise.all([
  client.getBlock({ blockNumber: startBlock }),
  client.getBlock({ blockNumber: endBlock }),
]);
const startTimestamp = Number(startBlockData.timestamp);
const endTimestamp = Number(endBlockData.timestamp);
```

### Step 2: Fetch Events

```typescript
async function fetchEvents(startBlock: bigint, endBlock: bigint) {
  // Fetch all 4 event types in parallel
  const [accrueRaw, borrowRaw, repayRaw, liquidateRaw] = await Promise.all([
    client.getLogs({
      address: MORPHO_BLUE,
      event: parseAbiItem("event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)"),
      args: { id: MARKET_ID },
      fromBlock: startBlock,
      toBlock: endBlock,
    }),
    client.getLogs({
      address: MORPHO_BLUE,
      event: parseAbiItem("event Borrow(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)"),
      args: { id: MARKET_ID },
      fromBlock: startBlock,
      toBlock: endBlock,
    }),
    client.getLogs({
      address: MORPHO_BLUE,
      event: parseAbiItem("event Repay(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)"),
      args: { id: MARKET_ID },
      fromBlock: startBlock,
      toBlock: endBlock,
    }),
    client.getLogs({
      address: MORPHO_BLUE,
      event: parseAbiItem("event Liquidate(bytes32 indexed id, address caller, address indexed borrower, uint256 repaidAssets, uint256 repaidShares, uint256 seizedAssets, uint256 badDebtAssets, uint256 badDebtShares)"),
      args: { id: MARKET_ID },
      fromBlock: startBlock,
      toBlock: endBlock,
    }),
  ]);

  // Parse and add timestamps (need to fetch block timestamps)
  // ... transform raw logs to TimelineEvent[]
}
```

### Step 3: Get Block Timestamps

Events don't include timestamps directly. We need to fetch them:

```typescript
async function getBlockTimestamps(blockNumbers: bigint[]): Promise<Map<bigint, number>> {
  const unique = [...new Set(blockNumbers.map(String))].map(BigInt);
  const timestamps = new Map<bigint, number>();
  
  // Batch fetch blocks (be mindful of RPC limits)
  const BATCH_SIZE = 100;
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const blocks = await Promise.all(
      batch.map(bn => client.getBlock({ blockNumber: bn }))
    );
    blocks.forEach((block, idx) => {
      timestamps.set(batch[idx], Number(block.timestamp));
    });
  }
  
  return timestamps;
}
```

### Step 4: Build Timeline

```typescript
function buildTimeline(
  accrueEvents: AccrueInterestEvent[],
  borrowEvents: BorrowEvent[],
  repayEvents: RepayEvent[],
  liquidateEvents: LiquidateEvent[]
): TimelineEvent[] {
  const all: TimelineEvent[] = [
    ...accrueEvents,
    ...borrowEvents,
    ...repayEvents,
    ...liquidateEvents,
  ];
  
  // Sort by (blockNumber, transactionIndex, logIndex)
  return all.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return a.blockNumber < b.blockNumber ? -1 : 1;
    }
    if (a.transactionIndex !== b.transactionIndex) {
      return a.transactionIndex - b.transactionIndex;
    }
    return a.logIndex - b.logIndex;
  });
}
```

### Step 5: Process Timeline and Calculate Overpayments

```typescript
function calculateOverpayments(
  timeline: TimelineEvent[],
  startTimestamp: number,
  endTimestamp: number
): Map<string, bigint> {
  // State tracking
  const borrowerDebts = new Map<string, bigint>();  // address → debt in assets
  let currentRate = 0n;                              // per-second rate in WAD
  let lastTimestamp = startTimestamp;
  
  // Overpayment accumulator
  const overpayments = new Map<string, bigint>();   // address → overpayment in assets
  
  // Helper: accrue overpayments for the time segment
  function accrueSegment(toTimestamp: number) {
    const elapsed = BigInt(toTimestamp - lastTimestamp);
    if (elapsed <= 0n) return;
    
    // Check if rate exceeds cap
    if (currentRate > APR_CAP_PER_SECOND) {
      const excessRate = currentRate - APR_CAP_PER_SECOND;
      
      for (const [borrower, debt] of borrowerDebts) {
        if (debt > 0n) {
          // overpayment = debt × excessRate × elapsed / WAD
          const overpayment = (debt * excessRate * elapsed) / WAD;
          const existing = overpayments.get(borrower) ?? 0n;
          overpayments.set(borrower, existing + overpayment);
        }
      }
    }
    
    // Grow all debts by actual rate (for accurate tracking)
    if (currentRate > 0n) {
      for (const [borrower, debt] of borrowerDebts) {
        if (debt > 0n) {
          const interest = (debt * currentRate * elapsed) / WAD;
          borrowerDebts.set(borrower, debt + interest);
        }
      }
    }
    
    lastTimestamp = toTimestamp;
  }
  
  // Process each event
  for (const event of timeline) {
    // Accrue up to this event's timestamp
    accrueSegment(event.timestamp);
    
    // Process the event
    switch (event.type) {
      case "accrue":
        // Update the rate for the NEXT segment
        // Note: prevBorrowRate is the rate that WAS applied, not the new rate
        // However, for our purposes, we use it as the current rate going forward
        // until the next AccrueInterest event
        currentRate = event.prevBorrowRate;
        break;
        
      case "borrow":
        const currentDebt = borrowerDebts.get(event.borrower) ?? 0n;
        borrowerDebts.set(event.borrower, currentDebt + event.assets);
        break;
        
      case "repay":
        const debtBefore = borrowerDebts.get(event.borrower) ?? 0n;
        const newDebt = debtBefore > event.assets ? debtBefore - event.assets : 0n;
        borrowerDebts.set(event.borrower, newDebt);
        break;
        
      case "liquidate":
        const debtBeforeLiq = borrowerDebts.get(event.borrower) ?? 0n;
        const newDebtLiq = debtBeforeLiq > event.repaidAssets 
          ? debtBeforeLiq - event.repaidAssets 
          : 0n;
        borrowerDebts.set(event.borrower, newDebtLiq);
        break;
    }
  }
  
  // Final accrual from last event to end timestamp
  accrueSegment(endTimestamp);
  
  return overpayments;
}
```

### Step 6: Generate Report

```typescript
function generateReport(
  overpayments: Map<string, bigint>,
  startBlock: bigint,
  endBlock: bigint,
  startTimestamp: number,
  endTimestamp: number
): RefundReport {
  // Filter out zero overpayments and format
  const borrowers: BorrowerRefund[] = [];
  let totalOverpayment = 0n;
  
  for (const [address, amount] of overpayments) {
    if (amount > 0n) {
      borrowers.push({
        address,
        overpayment: formatUnits(amount, USDC_DECIMALS),
      });
      totalOverpayment += amount;
    }
  }
  
  // Sort by overpayment descending
  borrowers.sort((a, b) => 
    parseFloat(b.overpayment) - parseFloat(a.overpayment)
  );
  
  return {
    marketId: MARKET_ID,
    chain: "polygon",
    morphoBlue: MORPHO_BLUE,
    thresholdAprPercent: "5.0",
    periodStartBlock: Number(startBlock),
    periodEndBlock: Number(endBlock),
    periodStartTimestamp: startTimestamp,
    periodEndTimestamp: endTimestamp,
    totalOverpayment: formatUnits(totalOverpayment, USDC_DECIMALS),
    borrowerCount: borrowers.length,
    borrowers,
    generatedAt: new Date().toISOString(),
  };
}
```

### Step 7: Write Output

```typescript
async function writeReport(report: RefundReport) {
  const timestamp = Date.now();
  const filename = `refunds/report-${timestamp}.json`;
  
  await Bun.write(filename, JSON.stringify(report, null, 2));
  
  console.log(`Report written to ${filename}`);
  console.log(`Total overpayment: ${report.totalOverpayment} USDC`);
  console.log(`Borrowers affected: ${report.borrowerCount}`);
}
```

---

## File Structure

```
src/
  lib/
    refund/
      types.ts          # TypeScript interfaces
      config.ts         # Constants (addresses, market ID, APR cap, ABI)
      events.ts         # Event fetching and parsing
      calculator.ts     # Timeline processing and overpayment math
      report.ts         # Report generation and file writing

  scripts/
    refund-indexer.ts   # Main entry point

refunds/                # Output directory
  .gitkeep
  report-{timestamp}.json
```

---

## Main Script Entry Point

```typescript
// src/scripts/refund-indexer.ts
import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import { MORPHO_BLUE, MARKET_ID, BLOCKS_PER_HOUR } from "../lib/refund/config";
import { fetchAllEvents } from "../lib/refund/events";
import { buildTimeline, calculateOverpayments } from "../lib/refund/calculator";
import { generateReport, writeReport } from "../lib/refund/report";

async function main() {
  // Validate RPC
  const rpc = process.env.INFURA_POLYGON_MAINNET_RPC;
  if (!rpc) {
    console.error("Error: INFURA_POLYGON_MAINNET_RPC not set");
    process.exit(1);
  }
  
  // Create client
  const client = createPublicClient({
    chain: polygon,
    transport: http(rpc),
  });
  
  console.log("Morpho Blue Refund Indexer");
  console.log("==========================");
  console.log(`Market: ${MARKET_ID}`);
  console.log(`APR Cap: 5%`);
  
  // Get block range
  const currentBlock = await client.getBlockNumber();
  const startBlock = currentBlock - BLOCKS_PER_HOUR;
  
  console.log(`\nBlock range: ${startBlock} → ${currentBlock}`);
  
  // Fetch timestamps
  const [startBlockData, endBlockData] = await Promise.all([
    client.getBlock({ blockNumber: startBlock }),
    client.getBlock({ blockNumber: currentBlock }),
  ]);
  const startTimestamp = Number(startBlockData.timestamp);
  const endTimestamp = Number(endBlockData.timestamp);
  
  const durationMinutes = Math.round((endTimestamp - startTimestamp) / 60);
  console.log(`Time range: ${durationMinutes} minutes`);
  
  // Fetch events
  console.log("\nFetching events...");
  const events = await fetchAllEvents(client, startBlock, currentBlock);
  console.log(`  AccrueInterest: ${events.accrue.length}`);
  console.log(`  Borrow: ${events.borrow.length}`);
  console.log(`  Repay: ${events.repay.length}`);
  console.log(`  Liquidate: ${events.liquidate.length}`);
  
  // Build timeline
  const timeline = buildTimeline(
    events.accrue,
    events.borrow,
    events.repay,
    events.liquidate
  );
  console.log(`\nTimeline events: ${timeline.length}`);
  
  // Calculate overpayments
  console.log("Calculating overpayments...");
  const overpayments = calculateOverpayments(timeline, startTimestamp, endTimestamp);
  
  // Generate and write report
  const report = generateReport(
    overpayments,
    startBlock,
    currentBlock,
    startTimestamp,
    endTimestamp
  );
  
  await writeReport(report);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
```

---

## Output Format

```json
{
  "marketId": "0x1cfe584af3db05c7f39d60e458a87a8b2f6b5d8c6125631984ec489f1d13553b",
  "chain": "polygon",
  "morphoBlue": "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67",
  "thresholdAprPercent": "5.0",
  "periodStartBlock": 12345678,
  "periodEndBlock": 12347478,
  "periodStartTimestamp": 1700000000,
  "periodEndTimestamp": 1700003600,
  "totalOverpayment": "142.507823",
  "borrowerCount": 2,
  "borrowers": [
    { "address": "0xABC...", "overpayment": "95.234567" },
    { "address": "0xDEF...", "overpayment": "47.273256" }
  ],
  "generatedAt": "2026-01-29T12:00:00.000Z"
}
```

---

## Implementation Checklist

### Setup
- [ ] Create `refunds/` directory with `.gitkeep`
- [ ] Add `refunds/*.json` to `.gitignore`

### Core Files
- [ ] `src/lib/refund/types.ts` - All TypeScript interfaces
- [ ] `src/lib/refund/config.ts` - Constants, ABI, addresses
- [ ] `src/lib/refund/events.ts` - Event fetching with viem getLogs
- [ ] `src/lib/refund/calculator.ts` - Timeline building and overpayment calculation
- [ ] `src/lib/refund/report.ts` - Report generation and file writing
- [ ] `src/scripts/refund-indexer.ts` - Main entry point

### package.json
- [ ] Add script: `"refund-indexer": "bun run src/scripts/refund-indexer.ts"`

### Testing
- [ ] Run against live Polygon data
- [ ] Verify event counts match block explorer
- [ ] Validate math with manual calculation on small sample

---

## Edge Cases

| Case | Handling |
|------|----------|
| No AccrueInterest events in range | Rate stays at 0, no overpayments |
| Rate always below 5% APR | All overpayments = 0, empty borrowers array |
| Borrower repays to zero mid-period | Stop accumulating, exclude from final output |
| Negative debt (shouldn't happen) | Clamp to 0n |
| No events at all | Empty report with zero totals |
| RPC rate limiting | Consider adding retry logic with exponential backoff |
| Very large block ranges | May need pagination for getLogs |

---

## Rate Math Reference

### Understanding prevBorrowRate

The `prevBorrowRate` in `AccrueInterest` is the per-second interest rate that was applied since the last accrual, expressed in WAD:

- `1e18` (WAD) = 100% per second (impossibly high)
- `1e16` = 1% per second (still impossibly high)
- Realistic values are tiny, e.g., `~1.5e9` ≈ 5% APR

### Conversion Formula

```
APR (as decimal) = prevBorrowRate × SECONDS_PER_YEAR / WAD
APR (as percent) = APR (as decimal) × 100

Example:
  prevBorrowRate = 1585489599n
  APR = 1585489599 × 31536000 / 1e18 = 0.05 = 5%
```

### Overpayment Formula

For a borrower with debt `D` over time period `t` seconds, when actual rate `R` exceeds cap `C`:

```
excess_rate = R - C                    (per-second, in WAD)
overpayment = D × excess_rate × t / WAD
```

All arithmetic in bigint to preserve precision.

---

## Usage

```bash
# Run the indexer
bun run refund-indexer

# Or directly
bun run src/scripts/refund-indexer.ts
```

---

## Dependencies

**Already in project (no new installs needed):**
- `viem` - Ethereum client, event fetching, formatUnits
- `bun` - Runtime, file I/O with Bun.write

---

## Notes

1. **Block time variability**: Polygon averages ~2s/block but varies. The 1800 block window is approximate.

2. **Rate interpretation**: `prevBorrowRate` represents the rate that *was* applied. We use it as the current rate until the next `AccrueInterest` event.

3. **Precision**: All calculations use `bigint`. Human-readable conversion only at final output.

4. **No state persistence**: Each run scans from scratch. For hourly runs on a ~1800 block window, this is fast enough.

5. **Existing debt**: The indexer only tracks debt changes within the scan window. Borrowers who had debt before `startBlock` will need their initial debt fetched separately (see Future Improvements).

---

## Future Improvements

1. **Initial debt snapshot**: Query on-chain state at `startBlock` to get accurate starting debt for each borrower, rather than assuming 0.

2. **Cumulative reports**: Aggregate multiple hourly reports into daily/weekly summaries.

3. **Alerting**: Notify if total overpayment exceeds a threshold.

4. **Database storage**: Store results in SQLite for historical analysis.
