import type { MarketOverpaymentsJson } from "./api";
import { microUsdcToUsdc } from "./api";

interface Props {
  marketData: MarketOverpaymentsJson | null;
  loading: boolean;
  error: string | null;
}

export function ReportSummary({ marketData, loading, error }: Props) {
  if (loading) return <section className="card"><p>Computing overpayments…</p></section>;
  if (error) return <section className="card card--error"><p>{error}</p></section>;
  if (!marketData) return <section className="card"><p>No data for this market.</p></section>;

  const totalUsdc = microUsdcToUsdc(marketData.totalOverpayment);
  const startDate = new Date(marketData.startTimestamp * 1000).toISOString();
  const endDate = new Date(marketData.endTimestamp * 1000).toISOString();

  return (
    <section className="card">
      <h2>Refunds due</h2>
      <dl className="summary-dl">
        <dt>Total refund due</dt>
        <dd className="summary-total">{totalUsdc} USDC</dd>
        <dt>Event window</dt>
        <dd>{startDate} → {endDate}</dd>
        <dt>Events</dt>
        <dd>{marketData.eventCount}</dd>
        <dt>Borrowers with overpayment</dt>
        <dd>{marketData.borrowerCount}</dd>
      </dl>
    </section>
  );
}
