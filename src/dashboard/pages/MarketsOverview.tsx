import { Link } from "react-router-dom";
import { useConfig, useMarketSummary } from "../hooks/useApi";
import { microUsdcToUsdc } from "../api";
import { format } from "date-fns";

export function MarketsOverview() {
  const { data: config } = useConfig();
  const { data: summary, isLoading, error } = useMarketSummary();
  const capLabel = config != null ? `${config.aprCapPercent}%` : "cap";

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
      <h1 className="text-2xl font-bold text-gray-900">Markets</h1>
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
    </div>
  );
}
