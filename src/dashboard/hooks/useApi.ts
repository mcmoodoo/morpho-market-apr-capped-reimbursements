import { useQuery } from "@tanstack/react-query";
import {
  getMarkets,
  getIndexerStatus,
  getMarketDetail,
  getMarketOverpayments,
  getTopBorrowers,
  getMarketSummary,
  getMarketEvents,
  getOverpaymentsByBorrower,
  getBorrowerEvents,
} from "../api";
import { useDashboardStore } from "../store";

export function useMarkets() {
  return useQuery({
    queryKey: ["markets"],
    queryFn: getMarkets,
  });
}

export function useIndexerStatus() {
  return useQuery({
    queryKey: ["status", "indexer"],
    queryFn: getIndexerStatus,
  });
}

export function useMarketDetail(marketId: string | null) {
  return useQuery({
    queryKey: ["markets", marketId],
    queryFn: () => getMarketDetail(marketId!),
    enabled: !!marketId,
  });
}

export function useMarketOverpayments(marketId: string | null) {
  const from = useDashboardStore((s) => s.fromTimestamp);
  const to = useDashboardStore((s) => s.toTimestamp);
  return useQuery({
    queryKey: ["markets", marketId, "overpayments", from, to],
    queryFn: () => getMarketOverpayments(marketId!, from ?? undefined, to ?? undefined),
    enabled: !!marketId,
  });
}

export function useTopBorrowers(marketId: string | null, limit = 20) {
  const from = useDashboardStore((s) => s.fromTimestamp);
  const to = useDashboardStore((s) => s.toTimestamp);
  return useQuery({
    queryKey: ["analytics", "top-borrowers", marketId, from, to, limit],
    queryFn: () => getTopBorrowers(marketId!, from ?? undefined, to ?? undefined, limit),
    enabled: !!marketId,
  });
}

export function useMarketSummary() {
  const from = useDashboardStore((s) => s.fromTimestamp);
  const to = useDashboardStore((s) => s.toTimestamp);
  return useQuery({
    queryKey: ["analytics", "market-summary", from, to],
    queryFn: () => getMarketSummary(from ?? undefined, to ?? undefined),
  });
}

export function useMarketEvents(
  marketId: string | null,
  opts?: { type?: string; limit?: number; offset?: number }
) {
  return useQuery({
    queryKey: ["markets", marketId, "events", opts?.type, opts?.limit, opts?.offset],
    queryFn: () => getMarketEvents(marketId!, opts),
    enabled: !!marketId,
  });
}

export function useBorrowerOverpayments(address: string | null) {
  const from = useDashboardStore((s) => s.fromTimestamp);
  const to = useDashboardStore((s) => s.toTimestamp);
  return useQuery({
    queryKey: ["borrowers", address, "overpayments", from, to],
    queryFn: () => getOverpaymentsByBorrower(address!, { fromTimestamp: from ?? undefined, toTimestamp: to ?? undefined }),
    enabled: !!address,
  });
}

export function useBorrowerEvents(address: string | null, opts?: { marketId?: string; type?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["borrowers", address, "events", opts?.marketId, opts?.type, opts?.limit, opts?.offset],
    queryFn: () => getBorrowerEvents(address!, opts),
    enabled: !!address,
  });
}
