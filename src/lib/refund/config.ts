// Math constants
export const WAD = 10n ** 18n; // 1e18 (Morpho's decimal precision)
export const SECONDS_PER_YEAR = 31536000n; // 365 * 24 * 60 * 60
export const USDC_DECIMALS = 6;

// APR cap configuration
export const APR_CAP_PERCENT = 5n; // 5%
export const APR_CAP_WAD = (APR_CAP_PERCENT * WAD) / 100n; // 0.05 * 1e18 = 5e16
export const APR_CAP_PER_SECOND = APR_CAP_WAD / SECONDS_PER_YEAR; // ~1,585,489,599

// Block range
export const BLOCKS_PER_HOUR = 5n; // Reduced for testing (was 1800n for ~1 hour)

// Addresses
export const MORPHO_BLUE =
  "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67" as const;
export const MARKET_ID =
  "0x1cfe584af3db05c7f39d60e458a87a8b2f6b5d8c6125631984ec489f1d13553b" as const;

// Morpho Blue ABI (events only)
export const morphoBlueAbi = [
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
