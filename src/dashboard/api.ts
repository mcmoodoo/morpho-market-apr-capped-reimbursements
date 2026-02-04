/** Client for dashboard API. Amounts from API are micro-USDC (string). */

const BASE = "";

export interface ReportJson {
  id: number;
  marketId: string;
  fromBlock: number | null;
  toBlock: number | null;
  startTimestamp: number;
  endTimestamp: number;
  eventCount: number;
  borrowerCount: number;
  totalOverpayment: string;
  createdAt: number;
}

export interface OverpaymentJson {
  borrowerAddress: string;
  overpayment: string;
}

export interface BorrowerOverpaymentJson {
  reportId: number;
  marketId: string;
  createdAt: number;
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

export async function getLatestReport(marketId: string): Promise<ReportJson | null> {
  const res = await fetch(`${BASE}/reports/latest?marketId=${encodeURIComponent(marketId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function getOverpaymentsForReport(reportId: number): Promise<OverpaymentJson[]> {
  const res = await fetch(`${BASE}/reports/${reportId}/overpayments`);
  if (!res.ok) throw await apiError(res);
  const data = await res.json();
  return data.overpayments ?? [];
}

export async function getOverpaymentsByBorrower(address: string): Promise<BorrowerOverpaymentJson[]> {
  const res = await fetch(`${BASE}/borrowers/${encodeURIComponent(address)}/overpayments`);
  if (!res.ok) throw await apiError(res);
  const data = await res.json();
  return data.overpayments ?? [];
}

/** Default market (same as config MARKET_ID). */
export const DEFAULT_MARKET_ID = "0xe6392ff19d10454b099d692b58c361ef93e31af34ed1ef78232e07c78fe99169";

export function microUsdcToUsdc(micro: string): string {
  const n = Number(micro) / 1e6;
  return n.toFixed(6).replace(/\.?0+$/, "") || "0";
}
