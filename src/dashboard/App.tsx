import { useState, useEffect } from "react";
import {
  getLatestReport,
  getOverpaymentsForReport,
  DEFAULT_MARKET_ID,
  type ReportJson,
  type OverpaymentJson,
} from "./api";
import { ReportSummary } from "./ReportSummary";
import { OverpaymentsTable } from "./OverpaymentsTable";
import { BorrowerLookup } from "./BorrowerLookup";

export function App() {
  const [report, setReport] = useState<ReportJson | null>(null);
  const [overpayments, setOverpayments] = useState<OverpaymentJson[]>([]);
  const [loadingReport, setLoadingReport] = useState(true);
  const [loadingOverpayments, setLoadingOverpayments] = useState(true);
  const [errorReport, setErrorReport] = useState<string | null>(null);
  const [errorOverpayments, setErrorOverpayments] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingReport(true);
    setErrorReport(null);
    getLatestReport(DEFAULT_MARKET_ID)
      .then((r) => {
        if (!cancelled) {
          setReport(r);
        }
      })
      .catch((err) => {
        if (!cancelled) setErrorReport(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingReport(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!report) {
      setOverpayments([]);
      setLoadingOverpayments(false);
      return;
    }
    let cancelled = false;
    setLoadingOverpayments(true);
    setErrorOverpayments(null);
    getOverpaymentsForReport(report.id)
      .then((list) => {
        if (!cancelled) setOverpayments(list);
      })
      .catch((err) => {
        if (!cancelled) setErrorOverpayments(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingOverpayments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [report?.id]);

  return (
    <div className="app">
      <header className="header">
        <h1>Refund dashboard</h1>
      </header>
      <main className="main">
        <ReportSummary report={report} loading={loadingReport} error={errorReport} />
        <OverpaymentsTable
          overpayments={overpayments}
          loading={loadingOverpayments}
          error={errorOverpayments}
        />
        <BorrowerLookup />
      </main>
    </div>
  );
}
