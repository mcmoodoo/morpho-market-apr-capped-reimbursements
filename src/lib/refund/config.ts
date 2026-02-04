// Morpho Blue (Polygon)
export const MORPHO_BLUE =
  "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67" as const;

// Overpayment calculation
export const WAD = 10n ** 18n;
export const SECONDS_PER_YEAR = 31_536_000n; // 365 * 24 * 60 * 60
export const APR_CAP_PERCENT = 1n; // 1% APR cap
export const APR_CAP_WAD = (APR_CAP_PERCENT * WAD) / 100n;
export const APR_CAP_PER_SECOND = APR_CAP_WAD / SECONDS_PER_YEAR;

export const USDC_DECIMALS = 6;
// Morpho Blue emits assets in WAD (18 decimals), but USDC uses 6 decimals
// Convert from WAD to USDC: divide by 10^(18-6) = 10^12
export const WAD_TO_USDC = 10n ** 12n;
