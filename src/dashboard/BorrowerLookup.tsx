import { useState } from "react";
import type { BorrowerOverpaymentJson } from "./api";
import { getOverpaymentsByBorrower, microUsdcToUsdc } from "./api";

export function BorrowerLookup() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<BorrowerOverpaymentJson[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const addr = address.trim();
    if (!addr) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await getOverpaymentsByBorrower(addr);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h2>Look up borrower</h2>
      <form onSubmit={handleSubmit} className="lookup-form">
        <input
          type="text"
          placeholder="0x..."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="lookup-input"
        />
        <button type="submit" disabled={loading} className="btn">
          {loading ? "Loading…" : "Look up"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="lookup-result">
          {result.length === 0 ? (
            <p>No overpayments found for this address.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Report id</th>
                  <th>Market</th>
                  <th>Created at</th>
                  <th className="num">Overpayment (USDC)</th>
                </tr>
              </thead>
              <tbody>
                {result.map((row, i) => (
                  <tr key={`${row.reportId}-${i}`}>
                    <td>{row.reportId}</td>
                    <td title={row.marketId}>{row.marketId.slice(0, 10)}…</td>
                    <td>{new Date(row.createdAt * 1000).toISOString()}</td>
                    <td className="num">{microUsdcToUsdc(row.overpayment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
