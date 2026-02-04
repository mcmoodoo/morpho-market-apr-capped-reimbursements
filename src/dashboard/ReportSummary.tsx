import type { ReportJson } from "./api";
import { microUsdcToUsdc } from "./api";

interface Props {
  report: ReportJson | null;
  loading: boolean;
  error: string | null;
}

export function ReportSummary({ report, loading, error }: Props) {
  if (loading) return <section className="card"><p>Loading latest report…</p></section>;
  if (error) return <section className="card card--error"><p>{error}</p></section>;
  if (!report) return <section className="card"><p>No report found for this market.</p></section>;

  const totalUsdc = microUsdcToUsdc(report.totalOverpayment);
  const startDate = new Date(report.startTimestamp * 1000).toISOString();
  const endDate = new Date(report.endTimestamp * 1000).toISOString();
  const generatedAt = new Date(report.createdAt * 1000).toISOString();

  return (
    <section className="card">
      <h2>Refunds due (latest report)</h2>
      <dl className="summary-dl">
        <dt>Total refund due</dt>
        <dd className="summary-total">{totalUsdc} USDC</dd>
        <dt>Report window</dt>
        <dd>{startDate} → {endDate}</dd>
        <dt>Report id</dt>
        <dd>{report.id}</dd>
        <dt>Generated at</dt>
        <dd>{generatedAt}</dd>
        <dt>Events</dt>
        <dd>{report.eventCount}</dd>
        <dt>Borrowers with overpayment</dt>
        <dd>{report.borrowerCount}</dd>
      </dl>
    </section>
  );
}
