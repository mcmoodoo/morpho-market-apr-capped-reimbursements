# Refund calculation logic (step by step)

## 1. Inputs

- **`timeline`**: All events (accrue, borrow, repay, liquidate) for the market in **chronological order** by `(blockNumber, txIndex, logIndex)`.
- **`startTimestamp`**, **`endTimestamp`**: Unix seconds for the report window. We only accrue overpayments and interest between these two times.

---

## 2. State we keep

- **`borrowerDebts`**: Map `address → debt` (in asset units, e.g. USDC). Tracks each borrower's debt as we replay the timeline.
- **`currentRate`**: Borrow rate in force for the *current* segment, in **per-second WAD** (e.g. 1% APR → `APR_CAP_PER_SECOND` ≈ 0.01 / 31_536_000 in WAD).
- **`lastTimestamp`**: End of the last segment we processed (starts as `startTimestamp`).
- **`overpayments`**: Map `address → overpayment` (in assets). This is the refund we're computing.

---

## 3. Cap in per-second WAD

- **1% APR** → `APR_CAP_WAD = 0.01e18`, then **`APR_CAP_PER_SECOND = APR_CAP_WAD / SECONDS_PER_YEAR`** (per-second rate in WAD).
- Any period where `currentRate > APR_CAP_PER_SECOND` is "above cap"; we treat the excess as overpayment.

---

## 4. Processing each event (in order)

For **every** event we do two things in order:

### A. Accrue the segment *up to* this event's time

Call **`accrueSegment(event.timestamp)`**:

1. **Elapsed time**  
   `elapsed = toTimestamp - lastTimestamp` (seconds). If ≤ 0, we skip the segment.

2. **Overpayment (refund) for this segment**  
   Only if `currentRate > APR_CAP_PER_SECOND`:
   - `excessRate = currentRate - APR_CAP_PER_SECOND`
   - For each borrower with `debt > 0`:  
     `overpayment += (debt * excessRate * elapsed) / WAD`  
   So we only count interest **above** the cap as overpayment.

3. **Update debt for next segment**  
   So our internal debt matches "interest accrued at full rate":
   - For each borrower with `debt > 0`:  
     `interest = (debt * currentRate * elapsed) / WAD`  
     `debt += interest`  
   (Simple interest per segment; Morpho uses compound, so this is an approximation.)

4. **Advance time**  
   `lastTimestamp = toTimestamp`.

### B. Apply the event (update state for the *next* segment)

- **`accrue`**  
  Set `currentRate = event.prevBorrowRate`. That's the rate Morpho *just* applied for the segment we already accrued in (A). We use it as the rate for the *next* segment until the next AccrueInterest.

- **`borrow`**  
  `debt[borrower] += event.assets` (new borrow adds to debt).

- **`repay`**  
  `debt[borrower] -= event.assets` (capped at 0).

- **`liquidate`**  
  `debt[borrower] -= event.repaidAssets` (capped at 0).

So: **first** we accrue the segment *to* the event's timestamp using the *previous* rate and debts; **then** we apply the event (new rate, new borrow, repay, or liquidation) for what comes after.

---

## 5. Final segment

After the last event we call **`accrueSegment(endTimestamp)`** so we accrue from the last event time to the end of the report window (same overpayment and debt-update logic).

---

## 6. Output

- **`overpayments`**: Map `borrower → overpayment` in assets (e.g. USDC).  
  Only segments where `currentRate > APR_CAP_PER_SECOND` contribute; we use `(debt × excessRate × elapsed) / WAD` per segment and sum per borrower.

---

## 7. Important details

| Point | Detail |
|-------|--------|
| **Order** | Timeline is sorted by `(blockNumber, txIndex, logIndex)` so we replay in chain order. |
| **Rate timing** | `accrue` gives `prevBorrowRate` (rate that was applied). We use it as `currentRate` for the *next* segment; the segment we just accrued was already using the previous `currentRate`. |
| **Interest model** | We use **simple interest** per segment: `debt * rate * elapsed / WAD`. Morpho uses **compound** (Taylor); so debt path and overpayment are approximate. |
| **Cap** | Refund = only the part of interest that exceeds 1% APR (per second in WAD). |
| **Boundaries** | We only accrue between `startTimestamp` and `endTimestamp`; events outside that window still update debt and rate when we process them, but we don't accrue outside the window. |
