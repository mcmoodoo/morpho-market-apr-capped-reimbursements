import { useParams, Link } from "react-router-dom";
import { useBorrowerOverpayments, useBorrowerEvents } from "../hooks/useApi";
import { microUsdcToUsdc } from "../api";
import { format } from "date-fns";

const POLYGONSCAN_TX = "https://polygonscan.com/tx/";
const POLYGONSCAN_ADDR = "https://polygonscan.com/address/";

export function BorrowerDetail() {
  const { address } = useParams<{ address: string }>();

  const { data: overpaymentsList, isLoading: loadingOver, error: errorOver } = useBorrowerOverpayments(address ?? null);
  const { data: eventsData, isLoading: loadingEvents } = useBorrowerEvents(address ?? null, { limit: 100, offset: 0 });

  if (!address) {
    return (
      <div className="card">
        <p className="text-gray-600">Missing borrower address.</p>
      </div>
    );
  }
  if (errorOver) {
    return (
      <div className="card border-red-200 bg-red-50">
        <p className="text-red-700">{errorOver instanceof Error ? errorOver.message : String(errorOver)}</p>
      </div>
    );
  }

  const totalOverpayment = overpaymentsList?.reduce((sum, o) => sum + Number(o.overpayment), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-gray-500 hover:text-gray-700 text-sm font-medium">
          ← Markets
        </Link>
        <h1 className="text-xl font-bold text-gray-900 truncate font-mono text-sm" title={address}>
          Borrower {address.slice(0, 10)}…{address.slice(-8)}
        </h1>
        <a
          href={POLYGONSCAN_ADDR + address}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost text-sm"
        >
          View on Polygonscan →
        </a>
      </div>

      {loadingOver ? (
        <p className="text-gray-500">Loading overpayments…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="stat-card">
            <span className="stat-label">Total overpayment (USDC)</span>
            <span className="stat-value text-green-700">{microUsdcToUsdc(String(totalOverpayment))}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Markets with overpayment</span>
            <span className="stat-value">{overpaymentsList?.length ?? 0}</span>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Overpayments by market</h2>
        {!overpaymentsList?.length ? (
          <p className="text-gray-500">No overpayments for this address.</p>
        ) : (
          <div className="table-container">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium">Market</th>
                  <th className="text-right p-3 font-medium">Overpayment (USDC)</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {overpaymentsList.map((o) => (
                  <tr key={o.marketId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs truncate max-w-[200px]" title={o.marketId}>
                      {o.marketId}
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium">{microUsdcToUsdc(o.overpayment)}</td>
                    <td className="p-3">
                      <Link
                        to={`/market/${encodeURIComponent(o.marketId)}`}
                        className="btn-ghost text-xs"
                      >
                        View market →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recent events (first 100)</h2>
        {loadingEvents ? (
          <p className="text-gray-500">Loading…</p>
        ) : !eventsData?.events.length ? (
          <p className="text-gray-500">No events for this borrower.</p>
        ) : (
          <div className="table-container">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Market</th>
                  <th className="text-left p-3 font-medium">Block</th>
                  <th className="text-left p-3 font-medium">Time</th>
                  <th className="text-left p-3 font-medium">Tx</th>
                </tr>
              </thead>
              <tbody>
                {eventsData.events.map((row: { marketId: string; event: Record<string, unknown> }, i: number) => {
                  const ev = row.event;
                  return (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3 font-medium">{String(ev.type)}</td>
                      <td className="p-3 font-mono text-xs truncate max-w-[120px]" title={row.marketId}>
                        {row.marketId.slice(0, 8)}…
                      </td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
