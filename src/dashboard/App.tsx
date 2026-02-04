import { useState, useEffect } from "react";
import {
  getLatestReport,
  getOverpaymentsForReport,
  getMarkets,
  type ReportJson,
  type OverpaymentJson,
} from "./api";
import { ReportSummary } from "./ReportSummary";
import { OverpaymentsTable } from "./OverpaymentsTable";
import { BorrowerLookup } from "./BorrowerLookup";

function getMarketFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("market");
}

export function App() {
  const [markets, setMarkets] = useState<string[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [report, setReport] = useState<ReportJson | null>(null);
  const [overpayments, setOverpayments] = useState<OverpaymentJson[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingReport, setLoadingReport] = useState(true);
  const [loadingOverpayments, setLoadingOverpayments] = useState(true);
  const [errorMarkets, setErrorMarkets] = useState<string | null>(null);
  const [errorReport, setErrorReport] = useState<string | null>(null);
  const [errorOverpayments, setErrorOverpayments] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingMarkets(true);
    setErrorMarkets(null);
    getMarkets()
      .then((list) => {
        if (!cancelled) {
          setMarkets(list);
          const urlMarket = getMarketFromUrl();
          if (urlMarket && list.includes(urlMarket)) {
            setSelectedMarket(urlMarket);
          } else if (list.length > 0) {
            setSelectedMarket(list[0]);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setErrorMarkets(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingMarkets(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedMarket) {
      setReport(null);
      setLoadingReport(false);
      return;
    }
    let cancelled = false;
    setLoadingReport(true);
    setErrorReport(null);
    getLatestReport(selectedMarket)
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
  }, [selectedMarket]);

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

  function handleMarketChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const market = e.target.value;
    setSelectedMarket(market);
    const url = new URL(window.location.href);
    url.searchParams.set("market", market);
    window.history.pushState({}, "", url);
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Refund dashboard</h1>
      </header>
      <main className="main">
        {loadingMarkets ? (
          <section className="card"><p>Loading markets…</p></section>
        ) : errorMarkets ? (
          <section className="card card--error"><p>{errorMarkets}</p></section>
        ) : markets.length === 0 ? (
          <section className="card"><p>No markets found. Run <code>bun run sync</code> to index events.</p></section>
        ) : (
          <>
            <section className="card">
              <label htmlFor="market-select" style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
                Market:
              </label>
              <select
                id="market-select"
                value={selectedMarket ?? ""}
                onChange={handleMarketChange}
                style={{
                  width: "100%",
                  maxWidth: "600px",
                  padding: "0.5rem 0.75rem",
                  fontSize: "14px",
                  fontFamily: "ui-monospace, monospace",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                  background: "#fff",
                }}
              >
                {markets.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </section>
            <ReportSummary report={report} loading={loadingReport} error={errorReport} />
            <OverpaymentsTable
              overpayments={overpayments}
              loading={loadingOverpayments}
              error={errorOverpayments}
            />
            <BorrowerLookup />
          </>
        )}
      </main>
    </div>
  );
}
