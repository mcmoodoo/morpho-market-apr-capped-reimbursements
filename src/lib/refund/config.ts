// Math constants
export const WAD = 10n ** 18n; // 1e18 (Morpho's decimal precision)
export const SECONDS_PER_YEAR = 31536000n; // 365 * 24 * 60 * 60
export const USDC_DECIMALS = 6;

// APR cap configuration
export const APR_CAP_PERCENT = 1n; // 1%
export const APR_CAP_WAD = (APR_CAP_PERCENT * WAD) / 100n; // 0.01 * 1e18 = 1e16
export const APR_CAP_PER_SECOND = APR_CAP_WAD / SECONDS_PER_YEAR; // ~317,097,919

// Block range (Arbitrum One ~0.25s per block)
// 24h = 86,400s → 86,400 / 0.25 = 345,600 blocks
export const BLOCKS_PER_24_HOURS = 345_600n;
// 1h = 3,600s → 3,600 / 0.25 = 14,400 blocks (chunk size per sync run)
export const BLOCKS_PER_1_HOUR = 14_400n;

// Addresses (Arbitrum One)
export const MORPHO_BLUE =
  "0x6c247b1F6182318877311737BaC0844bAa518F5e" as const;
export const MARKET_ID =
  "0xe6392ff19d10454b099d692b58c361ef93e31af34ed1ef78232e07c78fe99169" as const;
