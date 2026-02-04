import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useConfig, useMarketSummary } from "../hooks/useApi";
import { microUsdcToUsdc } from "../api";
import { format } from "date-fns";
import type { MarketSummaryJson } from "../api";

type ViewMode = "cards" | "table";
type SortKey = "marketId" | "totalOverpayment" | "eventCount" | "borrowerCount" | "activeBorrowersUnderCap" | "activeBorrowersAboveCap";

function sortSummary(
  summary: MarketSummaryJson[],
  sortKey: SortKey,
  desc: boolean
): MarketSummaryJson[] {
  const mult = desc ? -1 : 1;
  return [...summary].sort((a, b) => {
    let av: string | number = a[sortKey];
    let bv: string | number = b[sortKey];
    if (sortKey === "totalOverpayment") {
      av = Number(a.totalOverpayment);
      bv = Number(b.totalOverpayment);
    }
    if (typeof av === "number" && typeof bv === "number") {
      return mult * (av - bv);
    }
    const as = String(av);
    const bs = String(bv);
    return mult * (as < bs ? -1 : as > bs ? 1 : 0);
  });
}

export function MarketsOverview() {
  const { data: config } = useConfig();
  const { data: summary, isLoading, error } = useMarketSummary();
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [sortKey, setSortKey] = useState<SortKey>("totalOverpayment");
  const [sortDesc, setSortDesc] = useState(true);
  const capLabel = config != null ? `${config.aprCapPercent}%` : "cap";

  const sortedSummary = useMemo(
    () => (summary ? sortSummary(summary, sortKey, sortDesc) : []),
    [summary, sortKey, sortDesc]
  );
  const totalOverpaymentAll = useMemo(
    () => summary?.reduce((sum, m) => sum + Number(m.totalOverpayment), 0) ?? 0,
    [summary]
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(key !== "marketId"); // default desc for numeric columns, asc for market id
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading markets…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="card border-red-200 bg-red-50">
        <p className="text-red-700">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    );
  }
  if (!summary?.length) {
    return (
      <div className="card">
        <p className="text-gray-600">No markets found. Run <code className="bg-gray-100 px-1 rounded">bun run sync</code> to index events.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Markets</h1>
        <div className="flex rounded-lg border border-gray-200 p-1 bg-white">
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md ${viewMode === "cards" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
          >
            Cards
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md ${viewMode === "table" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
          >
            Table
          </button>
        </div>
      </div>

      {viewMode === "cards" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summary.map((m) => (
            <Link
              key={m.marketId}
              to={`/market/${encodeURIComponent(m.marketId)}`}
              className="card hover:shadow-md hover:border-gray-300 transition"
            >
              <div className="font-mono text-xs text-gray-500 truncate" title={m.marketId}>
                {m.marketId.slice(0, 10)}…
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Events</span>
                  <div className="font-semibold tabular-nums">{m.eventCount.toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-gray-500">Borrowers (overpay)</span>
                  <div className="font-semibold tabular-nums">{m.borrowerCount}</div>
                </div>
                <div>
                  <span className="text-gray-500" title={`Active when rate ≤ ${capLabel} APR`}>Under {capLabel}</span>
                  <div className="font-semibold tabular-nums">{m.activeBorrowersUnderCap}</div>
                </div>
                <div>
                  <span className="text-gray-500" title={`Active when rate > ${capLabel} APR`}>Above {capLabel}</span>
                  <div className="font-semibold tabular-nums">{m.activeBorrowersAboveCap}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Total overpayment (USDC)</span>
                  <div className="font-semibold text-green-700 tabular-nums">{microUsdcToUsdc(m.totalOverpayment)}</div>
                </div>
              </div>
              {m.startTimestamp != null && m.endTimestamp != null && (
                <div className="mt-2 text-xs text-gray-400">
                  {format(m.startTimestamp * 1000, "MMM d, yyyy")} → {format(m.endTimestamp * 1000, "MMM d, yyyy")}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {viewMode === "table" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Total overpayment (all markets):{" "}
            <span className="font-semibold text-green-700 tabular-nums">{microUsdcToUsdc(String(totalOverpaymentAll))} USDC</span>
          </p>
          <div className="table-container">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium">
                    <button type="button" onClick={() => handleSort("marketId")} className="hover:text-gray-900">
                      Market
                      {sortKey === "marketId" && (sortDesc ? " ↓" : " ↑")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-medium">
                    <button type="button" onClick={() => handleSort("totalOverpayment")} className="hover:text-gray-900 ml-auto block">
                      Overpayment (USDC)
                      {sortKey === "totalOverpayment" && (sortDesc ? " ↓" : " ↑")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-medium text-gray-500" title="Share of total overpayment">
                    %
                  </th>
                  <th className="text-right p-3 font-medium">
                    <button type="button" onClick={() => handleSort("eventCount")} className="hover:text-gray-900 ml-auto block">
                      Events
                      {sortKey === "eventCount" && (sortDesc ? " ↓" : " ↑")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-medium">
                    <button type="button" onClick={() => handleSort("borrowerCount")} className="hover:text-gray-900 ml-auto block">
                      Borrowers
                      {sortKey === "borrowerCount" && (sortDesc ? " ↓" : " ↑")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-medium">
                    <button type="button" onClick={() => handleSort("activeBorrowersUnderCap")} className="hover:text-gray-900 ml-auto block">
                      Under {capLabel}
                      {sortKey === "activeBorrowersUnderCap" && (sortDesc ? " ↓" : " ↑")}
                    </button>
                  </th>
                  <th className="text-right p-3 font-medium">
                    <button type="button" onClick={() => handleSort("activeBorrowersAboveCap")} className="hover:text-gray-900 ml-auto block">
                      Above {capLabel}
                      {sortKey === "activeBorrowersAboveCap" && (sortDesc ? " ↓" : " ↑")}
                    </button>
                  </th>
                  <th className="text-left p-3 font-medium text-gray-500">Time range</th>
                </tr>
              </thead>
              <tbody>
                {sortedSummary.map((m) => {
                  const pct = totalOverpaymentAll > 0 ? (100 * Number(m.totalOverpayment)) / totalOverpaymentAll : 0;
                  return (
                    <tr key={m.marketId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3">
                        <Link
                          to={`/market/${encodeURIComponent(m.marketId)}`}
                          className="font-mono text-xs text-blue-600 hover:underline truncate max-w-[180px] block"
                          title={m.marketId}
                        >
                          {m.marketId.slice(0, 10)}…{m.marketId.slice(-8)}
                        </Link>
                      </td>
                      <td className="p-3 text-right tabular-nums font-medium text-green-700">
                        {microUsdcToUsdc(m.totalOverpayment)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-gray-500">
                        {pct.toFixed(1)}%
                      </td>
                      <td className="p-3 text-right tabular-nums">{m.eventCount.toLocaleString()}</td>
                      <td className="p-3 text-right tabular-nums">{m.borrowerCount}</td>
                      <td className="p-3 text-right tabular-nums">{m.activeBorrowersUnderCap}</td>
                      <td className="p-3 text-right tabular-nums">{m.activeBorrowersAboveCap}</td>
                      <td className="p-3 text-gray-500 text-xs">
                        {m.startTimestamp != null && m.endTimestamp != null
                          ? `${format(m.startTimestamp * 1000, "MMM d")} – ${format(m.endTimestamp * 1000, "MMM d, yyyy")}`
                          : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
