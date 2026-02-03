// Morpho Blue (Arbitrum One)
export const MORPHO_BLUE =
  "0x6c247b1F6182318877311737BaC0844bAa518F5e" as const;
export const MARKET_ID =
  "0xe6392ff19d10454b099d692b58c361ef93e31af34ed1ef78232e07c78fe99169" as const;

// Overpayment calculation
export const WAD = 10n ** 18n;
export const SECONDS_PER_YEAR = 31_536_000n; // 365 * 24 * 60 * 60
export const APR_CAP_PERCENT = 1n; // 1% APR cap
export const APR_CAP_WAD = (APR_CAP_PERCENT * WAD) / 100n;
export const APR_CAP_PER_SECOND = APR_CAP_WAD / SECONDS_PER_YEAR;

export const USDC_DECIMALS = 6;
