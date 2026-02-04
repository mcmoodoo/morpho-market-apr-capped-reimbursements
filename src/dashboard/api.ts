/** Client for dashboard API. Amounts from API are micro-USDC (string). */

const BASE = "";

export interface MarketOverpaymentsJson {
  marketId: string;
  startTimestamp: number;
  endTimestamp: number;
  eventCount: number;
  borrowerCount: number;
  totalOverpayment: string;
  borrowers: Array<{ borrowerAddress: string; overpayment: string }>;
}

export interface OverpaymentJson {
  borrowerAddress: string;
  overpayment: string;
}

export interface BorrowerOverpaymentJson {
  marketId: string;
  overpayment: string;
}

export interface MarketIndexerStatusJson {
  marketId: string;
  minBlock: number | null;
  maxBlock: number | null;
  minTimestamp: number | null;
  maxTimestamp: number | null;
  eventCount: number;
}

export interface MarketSummaryJson {
  marketId: string;
  eventCount: number;
  borrowerCount: number;
  totalOverpayment: string;
  startTimestamp: number | null;
  endTimestamp: number | null;
}

export interface TopBorrowersJson {
  marketId: string;
  fromTimestamp: number;
  toTimestamp: number;
  borrowers: Array<{ borrowerAddress: string; overpayment: string }>;
}

export interface MarketEventsResponse {
  marketId: string;
  total: number;
  events: Array<Record<string, unknown>>;
}

export interface BorrowerEventsResponse {
  borrowerAddress: string;
  total: number;
  events: Array<{ marketId: string; event: Record<string, unknown> }>;
}

async function apiError(res: Response): Promise<Error> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { error?: string };
    return new Error(j.error ?? res.statusText);
  } catch {
    return new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, BASE || window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.pathname + url.search);
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function getMarkets(): Promise<string[]> {
  const data = await get<{ markets: string[] }>("/markets");
  return data.markets ?? [];
}

export async function getIndexerStatus(): Promise<MarketIndexerStatusJson[]> {
  const data = await get<{ markets: MarketIndexerStatusJson[] }>("/status/indexer");
  return data.markets ?? [];
}

export async function getMarketDetail(marketId: string): Promise<MarketIndexerStatusJson> {
  return get<MarketIndexerStatusJson>(`/markets/${encodeURIComponent(marketId)}`);
}

export async function getMarketOverpayments(
  marketId: string,
  fromTimestamp?: number,
  toTimestamp?: number
): Promise<MarketOverpaymentsJson | null> {
  const params: Record<string, number | undefined> = {};
  if (fromTimestamp != null) params.fromTimestamp = fromTimestamp;
  if (toTimestamp != null) params.toTimestamp = toTimestamp;
  const res = await fetch(
    `${BASE}/markets/${encodeURIComponent(marketId)}/overpayments` +
      (Object.keys(params).length ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "")
  );
  if (res.status === 404) return null;
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function getTopBorrowers(
  marketId: string,
  fromTimestamp?: number,
  toTimestamp?: number,
  limit = 50
): Promise<TopBorrowersJson> {
  const params: Record<string, string | number> = { limit };
  if (fromTimestamp != null) params.fromTimestamp = fromTimestamp;
  if (toTimestamp != null) params.toTimestamp = toTimestamp;
  return get<TopBorrowersJson>(`/analytics/top-borrowers`, { ...params, marketId });
}

export async function getMarketSummary(fromTimestamp?: number, toTimestamp?: number): Promise<MarketSummaryJson[]> {
  const params: Record<string, number | undefined> = {};
  if (fromTimestamp != null) params.fromTimestamp = fromTimestamp;
  if (toTimestamp != null) params.toTimestamp = toTimestamp;
  const data = await get<{ markets: MarketSummaryJson[] }>("/analytics/market-summary", params);
  return data.markets ?? [];
}

export async function getMarketEvents(
  marketId: string,
  opts?: { type?: string; fromBlock?: number; toBlock?: number; limit?: number; offset?: number }
): Promise<MarketEventsResponse> {
  const params: Record<string, string | number> = {};
  if (opts?.type) params.type = opts.type;
  if (opts?.fromBlock != null) params.fromBlock = opts.fromBlock;
  if (opts?.toBlock != null) params.toBlock = opts.toBlock;
  if (opts?.limit != null) params.limit = opts.limit;
  if (opts?.offset != null) params.offset = opts.offset;
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  const res = await fetch(`${BASE}/markets/${encodeURIComponent(marketId)}/events` + (qs ? "?" + qs : ""));
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function getOverpaymentsByBorrower(
  address: string,
  opts?: { marketId?: string; fromTimestamp?: number; toTimestamp?: number }
): Promise<BorrowerOverpaymentJson[]> {
  const params: Record<string, string | number> = {};
  if (opts?.marketId) params.marketId = opts.marketId;
  if (opts?.fromTimestamp != null) params.fromTimestamp = opts.fromTimestamp;
  if (opts?.toTimestamp != null) params.toTimestamp = opts.toTimestamp;
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  const res = await fetch(
    `${BASE}/borrowers/${encodeURIComponent(address)}/overpayments` + (qs ? "?" + qs : "")
  );
  if (!res.ok) throw await apiError(res);
  const data = await res.json();
  return data.overpayments ?? [];
}

export async function getBorrowerEvents(
  address: string,
  opts?: { marketId?: string; type?: string; fromBlock?: number; toBlock?: number; limit?: number; offset?: number }
): Promise<BorrowerEventsResponse> {
  const params: Record<string, string | number> = {};
  if (opts?.marketId) params.marketId = opts.marketId;
  if (opts?.type) params.type = opts.type;
  if (opts?.fromBlock != null) params.fromBlock = opts.fromBlock;
  if (opts?.toBlock != null) params.toBlock = opts.toBlock;
  if (opts?.limit != null) params.limit = opts.limit;
  if (opts?.offset != null) params.offset = opts.offset;
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  const res = await fetch(`${BASE}/borrowers/${encodeURIComponent(address)}/events` + (qs ? "?" + qs : ""));
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export function microUsdcToUsdc(micro: string): string {
  const n = Number(micro) / 1e6;
  return n.toFixed(6).replace(/\.?0+$/, "") || "0";
}
