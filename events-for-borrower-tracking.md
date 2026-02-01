# Events Needed to Track Every Borrower's Position and Interest

To track every borrower's position at all times and know how much in interest every borrower paid at any point in time, you need to listen for and record **exactly four events** (per market).

---

## 1. **Borrow**

- **Who:** `onBehalf` = borrower.
- **Effect:** Borrower's `borrowShares` (and market `totalBorrowShares` / `totalBorrowAssets`) increase.
- **Use:** Add this borrower's debt (and update market totals) so you know their position after the borrow.

---

## 2. **Repay**

- **Who:** `onBehalf` = borrower.
- **Effect:** Borrower's `borrowShares` (and market totals) decrease by the repaid amount.
- **Use:** Subtract this repayment from that borrower's position and from market totals.

---

## 3. **Liquidate**

- **Who:** `borrower` = borrower whose debt is reduced.
- **Effect:** Borrower's `borrowShares` decrease by `repaidShares`; market totals drop; optional bad debt.
- **Use:** Subtract the liquidated amount (and any bad debt) from that borrower's position and from market totals.

---

## 4. **AccrueInterest**

- **Effect:** Market's `totalBorrowAssets` (and `totalSupplyAssets`) increase by `interest`; **no change to any borrower's `borrowShares`** or to `totalBorrowShares`.
- **Use:** Apply this accrual so the "exchange rate" (totalBorrowAssets / totalBorrowShares) is correct. Then each borrower's debt in assets = their `borrowShares` × (totalBorrowAssets / totalBorrowShares). That's how you know how much interest each of them has paid up to that point.

---

## Summary

| Event            | Role for "every borrower's position + interest" |
|------------------|---------------------------------------------------|
| **Borrow**       | Add borrower debt; update market totals.          |
| **Repay**        | Reduce borrower debt; update market totals.      |
| **Liquidate**    | Reduce borrower debt; update market totals.      |
| **AccrueInterest** | Apply market-level interest so debt-in-assets (and thus interest paid) is correct for every borrower. |

You do **not** need Supply, Withdraw, SupplyCollateral, or WithdrawCollateral to track **borrower** debt and interest; those affect supply/collateral only.

**Bottom line:** Listen for and record **Borrow**, **Repay**, **Liquidate**, and **AccrueInterest** (with block order and the fields you already use). That's enough to maintain every borrower's position and to compute how much interest each borrower paid at any point in time.
