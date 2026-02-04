import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import { useDashboardStore } from "../store";
import { useConfig } from "../hooks/useApi";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { timeRangePreset, setTimeRangePreset } = useDashboardStore();
  const [borrowerInput, setBorrowerInput] = useState("");
  const { data: config } = useConfig();

  const handleBorrowerLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const addr = borrowerInput.trim();
    if (addr) navigate(`/borrower/${encodeURIComponent(addr)}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-gray-900 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-4">
            <Link to="/" className="text-lg font-semibold hover:text-gray-200 shrink-0">
              Refund Analytics
            </Link>
            <form onSubmit={handleBorrowerLookup} className="hidden sm:flex items-center gap-2 shrink">
              <input
                type="text"
                placeholder="Borrower 0x…"
                value={borrowerInput}
                onChange={(e) => setBorrowerInput(e.target.value)}
                className="w-48 px-2 py-1.5 rounded text-sm bg-gray-800 text-white placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-gray-500"
              />
              <button type="submit" className="btn-ghost text-white hover:bg-gray-700 text-sm py-1.5">
                Look up
              </button>
            </form>
            <nav className="flex items-center gap-4 shrink-0">
              {config != null && (
                <span className="text-xs text-gray-400" title="Interest above this APR is counted as overpayment">
                  APR cap: {config.aprCapPercent}%
                </span>
              )}
              <Link
                to="/"
                className={`text-sm font-medium ${location.pathname === "/" ? "text-white" : "text-gray-300 hover:text-white"}`}
              >
                Markets
              </Link>
              <Tabs.Root value={timeRangePreset} onValueChange={(v) => setTimeRangePreset(v as "7d" | "30d" | "90d" | "all")}>
                <Tabs.List className="flex gap-1 rounded-md bg-gray-800 p-1">
                  {(["7d", "30d", "90d", "all"] as const).map((preset) => (
                    <Tabs.Trigger
                      key={preset}
                      value={preset}
                      className="rounded px-3 py-1.5 text-xs font-medium data-[state=active]:bg-gray-700 data-[state=inactive]:text-gray-400 hover:text-white"
                    >
                      {preset === "all" ? "All time" : preset}
                    </Tabs.Trigger>
                  ))}
                </Tabs.List>
              </Tabs.Root>
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
