import type { OverpaymentJson } from "./api";
import { microUsdcToUsdc } from "./api";

interface Props {
  overpayments: OverpaymentJson[];
  loading: boolean;
  error: string | null;
}

function shortAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function OverpaymentsTable({ overpayments, loading, error }: Props) {
  if (loading) return <section className="card"><p>Loading overpayments…</p></section>;
  if (error) return <section className="card card--error"><p>{error}</p></section>;
  if (overpayments.length === 0) return <section className="card"><p>No overpayments for this market.</p></section>;

  return (
    <section className="card">
      <h2>By borrower</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Address</th>
            <th className="num">Overpayment (USDC)</th>
          </tr>
        </thead>
        <tbody>
          {overpayments.map((row) => (
            <tr key={row.borrowerAddress}>
              <td title={row.borrowerAddress}>{shortAddress(row.borrowerAddress)}</td>
              <td className="num">{microUsdcToUsdc(row.overpayment)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
