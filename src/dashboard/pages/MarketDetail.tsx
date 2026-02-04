import { useParams, Link } from "react-router-dom";
import { useConfig, useMarketDetail, useMarketOverpayments, useTopBorrowers, useMarketEvents } from "../hooks/useApi";
import { microUsdcToUsdc } from "../api";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import * as Tabs from "@radix-ui/react-tabs";
import { useDashboardStore } from "../store";

const POLYGONSCAN_TX = "https://polygonscan.com/tx/";

export function MarketDetail() {
  const { marketId } = useParams<{ marketId: string }>();
  const setBorrower = useDashboardStore((s) => s.setSelectedBorrowerAddress);

  const { data: config } = useConfig();
  const { data: detail, isLoading: loadingDetail, error: errorDetail } = useMarketDetail(marketId ?? null);
  const { data: overpayments, isLoading: loadingOver, error: errorOver } = useMarketOverpayments(marketId ?? null);
  const { data: topBorrowers, isLoading: loadingTop } = useTopBorrowers(marketId ?? null, 15);
  const { data: eventsData, isLoading: loadingEvents } = useMarketEvents(marketId ?? null, { limit: 50, offset: 0 });

  const isLoading = loadingDetail || loadingOver;
  const error = errorDetail || errorOver;

  if (!marketId) {
    return (
      <div className="card">
        <p className="text-gray-600">Missing market id.</p>
      </div>
    );
  }
  if (isLoading && !detail) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading market…</p>
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

  const chartData =
    topBorrowers?.borrowers.slice(0, 10).map((b) => ({
      name: b.borrowerAddress.slice(0, 6) + "…" + b.borrowerAddress.slice(-4),
      address: b.borrowerAddress,
      overpayment: Number(b.overpayment) / 1e6,
    })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-gray-500 hover:text-gray-700 text-sm font-medium">
          ← Markets
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 truncate font-mono text-sm" title={marketId}>
          Market {marketId.slice(0, 10)}…
        </h1>
      </div>

      {detail && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="stat-card">
            <span className="stat-label">Event count</span>
            <span className="stat-value">{detail.eventCount.toLocaleString()}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Block range</span>
            <span className="stat-value text-lg">
              {detail.minBlock != null && detail.maxBlock != null
                ? `${detail.minBlock.toLocaleString()} – ${detail.maxBlock.toLocaleString()}`
                : "–"}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Time range</span>
            <span className="stat-value text-lg">
              {detail.minTimestamp != null && detail.maxTimestamp != null
                ? format(detail.minTimestamp * 1000, "MMM d") + " – " + format(detail.maxTimestamp * 1000, "MMM d, yyyy")
                : "–"}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Total overpayment (USDC)</span>
            <span className="stat-value text-green-700">
              {overpayments ? microUsdcToUsdc(overpayments.totalOverpayment) : "–"}
            </span>
          </div>
          <div className="stat-card" title={`Distinct borrowers who had debt when rate was ≤ ${config?.aprCapPercent ?? 1}% APR (cap)`}>
            <span className="stat-label">Active borrowers (rate ≤ {config?.aprCapPercent ?? 1}% APR)</span>
            <span className="stat-value">{overpayments?.activeBorrowersUnderCap ?? "–"}</span>
          </div>
          <div className="stat-card" title={`Distinct borrowers who had debt when rate was above ${config?.aprCapPercent ?? 1}% APR cap`}>
            <span className="stat-label">Active borrowers (rate &gt; {config?.aprCapPercent ?? 1}% APR)</span>
            <span className="stat-value">{overpayments?.activeBorrowersAboveCap ?? "–"}</span>
          </div>
        </div>
      )}

      <Tabs.Root defaultValue="chart">
        <Tabs.List className="flex gap-1 border-b border-gray-200 mb-4">
          <Tabs.Trigger
            value="chart"
            className="px-4 py-2 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:text-gray-900 text-gray-500"
          >
            Top borrowers (chart)
          </Tabs.Trigger>
          <Tabs.Trigger
            value="table"
            className="px-4 py-2 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:text-gray-900 text-gray-500"
          >
            Overpayments table
          </Tabs.Trigger>
          <Tabs.Trigger
            value="events"
            className="px-4 py-2 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:text-gray-900 text-gray-500"
          >
            Recent events
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="chart" className="outline-none">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Top 10 borrowers by overpayment (USDC)</h2>
            {loadingTop ? (
              <p className="text-gray-500">Loading…</p>
            ) : chartData.length === 0 ? (
              <p className="text-gray-500">No overpayments in this window.</p>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 60, right: 24 }}>
                    <XAxis type="number" unit=" USDC" tickFormatter={(v) => v.toFixed(2)} />
                    <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => v.toFixed(4) + " USDC"} />
                    <Bar dataKey="overpayment" fill="#059669" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Tabs.Content>

        <Tabs.Content value="table" className="outline-none">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Borrowers with overpayment</h2>
            {!overpayments?.borrowers.length ? (
              <p className="text-gray-500">No overpayments in this window.</p>
            ) : (
              <div className="table-container">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-3 font-medium">Address</th>
                      <th className="text-right p-3 font-medium">Overpayment (USDC)</th>
                      <th className="w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {overpayments.borrowers.map((b) => (
                      <tr key={b.borrowerAddress} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3 font-mono text-xs">{b.borrowerAddress}</td>
                        <td className="p-3 text-right tabular-nums font-medium">{microUsdcToUsdc(b.overpayment)}</td>
                        <td className="p-3">
                          <Link
                            to={`/borrower/${encodeURIComponent(b.borrowerAddress)}`}
                            className="btn-ghost text-xs"
                            onClick={() => setBorrower(b.borrowerAddress)}
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Tabs.Content>

        <Tabs.Content value="events" className="outline-none">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Recent events (first 50)</h2>
            {loadingEvents ? (
              <p className="text-gray-500">Loading…</p>
            ) : !eventsData?.events.length ? (
              <p className="text-gray-500">No events.</p>
            ) : (
              <div className="table-container">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-3 font-medium">Type</th>
                      <th className="text-left p-3 font-medium">Block</th>
                      <th className="text-left p-3 font-medium">Time</th>
                      <th className="text-left p-3 font-medium">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsData.events.map((ev: Record<string, unknown>, i: number) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3 font-medium">{String(ev.type)}</td>
                        <td className="p-3 tabular-nums">{String(ev.blockNumber)}</td>
                        <td className="p-3 text-gray-600">
                          {ev.timestamp != null ? format(Number(ev.timestamp) * 1000, "MMM d, HH:mm") : "–"}
                        </td>
                        <td className="p-3">
                          {ev.transactionHash ? (
                            <a
                              href={POLYGONSCAN_TX + ev.transactionHash}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline font-mono text-xs"
                            >
                              {String(ev.transactionHash).slice(0, 10)}…
                            </a>
                          ) : (
                            "–"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
