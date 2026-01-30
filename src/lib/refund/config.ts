// Math constants
export const WAD = 10n ** 18n; // 1e18 (Morpho's decimal precision)
export const SECONDS_PER_YEAR = 31536000n; // 365 * 24 * 60 * 60
export const USDC_DECIMALS = 6;

// APR cap configuration
export const APR_CAP_PERCENT = 1n; // 1%
export const APR_CAP_WAD = (APR_CAP_PERCENT * WAD) / 100n; // 0.01 * 1e18 = 1e16
export const APR_CAP_PER_SECOND = APR_CAP_WAD / SECONDS_PER_YEAR; // ~317,097,919

// Block range
export const BLOCKS_PER_HOUR = 93n; // Last 50 blocks (~1.5 min on Polygon)

// Addresses
export const MORPHO_BLUE =
  "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67" as const;
export const MARKET_ID =
  "0x1cfe584af3db05c7f39d60e458a87a8b2f6b5d8c6125631984ec489f1d13553b" as const;
