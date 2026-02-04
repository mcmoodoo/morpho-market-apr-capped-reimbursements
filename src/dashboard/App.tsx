import { useState, useEffect } from "react";
import {
  getMarketOverpayments,
  getMarkets,
  type MarketOverpaymentsJson,
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
  const [marketData, setMarketData] = useState<MarketOverpaymentsJson | null>(null);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingOverpayments, setLoadingOverpayments] = useState(true);
  const [errorMarkets, setErrorMarkets] = useState<string | null>(null);
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
      setMarketData(null);
      setLoadingOverpayments(false);
      return;
    }
    let cancelled = false;
    setLoadingOverpayments(true);
    setErrorOverpayments(null);
    getMarketOverpayments(selectedMarket)
      .then((data) => {
        if (!cancelled) setMarketData(data);
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
  }, [selectedMarket]);

  function handleMarketChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const market = e.target.value;
    setSelectedMarket(market);
    const url = new URL(window.location.href);
    url.searchParams.set("market", market);
    window.history.pushState({}, "", url);
  }

  const overpayments: OverpaymentJson[] = marketData?.borrowers ?? [];

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
            <ReportSummary marketData={marketData} loading={loadingOverpayments} error={errorOverpayments} />
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
