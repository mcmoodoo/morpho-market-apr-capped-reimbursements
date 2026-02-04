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

async function apiError(res: Response): Promise<Error> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { error?: string };
    return new Error(j.error ?? res.statusText);
  } catch {
    return new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
}

export async function getMarketOverpayments(marketId: string): Promise<MarketOverpaymentsJson | null> {
  const res = await fetch(`${BASE}/markets/${encodeURIComponent(marketId)}/overpayments`);
  if (res.status === 404) return null;
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function getOverpaymentsByBorrower(address: string): Promise<BorrowerOverpaymentJson[]> {
  const res = await fetch(`${BASE}/borrowers/${encodeURIComponent(address)}/overpayments`);
  if (!res.ok) throw await apiError(res);
  const data = await res.json();
  return data.overpayments ?? [];
}

/** Get list of available markets from the API. */
export async function getMarkets(): Promise<string[]> {
  const res = await fetch(`${BASE}/markets`);
  if (!res.ok) throw await apiError(res);
  const data = await res.json();
  return data.markets ?? [];
}

export function microUsdcToUsdc(micro: string): string {
  const n = Number(micro) / 1e6;
  return n.toFixed(6).replace(/\.?0+$/, "") || "0";
}
