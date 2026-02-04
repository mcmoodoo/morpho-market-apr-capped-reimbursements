import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { startOfDay, endOfDay } from "date-fns";
import { useDashboardStore } from "../store";
import type { TimeRangePreset } from "../store";
import { useConfig } from "../hooks/useApi";
import { DateRangeCalendar } from "./DateRangeCalendar";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { timeRangePreset, fromTimestamp, toTimestamp, setTimeRangePreset, setCustomTimeRange } = useDashboardStore();
  const [borrowerInput, setBorrowerInput] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const { data: config } = useConfig();

  const handleOpenCustom = (open: boolean) => {
    setCustomOpen(open);
    if (open) {
      setCustomFrom(fromTimestamp != null ? new Date(fromTimestamp * 1000) : null);
      setCustomTo(toTimestamp != null ? new Date(toTimestamp * 1000) : null);
    }
  };

  const handleApplyCustom = () => {
    if (customFrom == null || customTo == null) return;
    const from = Math.floor(startOfDay(customFrom).getTime() / 1000);
    const to = Math.floor(endOfDay(customTo).getTime() / 1000);
    if (from <= to) {
      setCustomTimeRange(from, to);
      setCustomOpen(false);
    }
  };

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
              <Tabs.Root value={timeRangePreset} onValueChange={(v) => setTimeRangePreset(v as TimeRangePreset)}>
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
                  <DropdownMenu.Root open={customOpen} onOpenChange={handleOpenCustom}>
                    <DropdownMenu.Trigger asChild>
                      <Tabs.Trigger
                        value="custom"
                        className="rounded px-3 py-1.5 text-xs font-medium data-[state=active]:bg-gray-700 data-[state=inactive]:text-gray-400 hover:text-white"
                      >
                        Custom
                      </Tabs.Trigger>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        className="rounded-lg bg-gray-800 p-3 shadow-lg border border-gray-700"
                        sideOffset={6}
                        align="end"
                      >
                        <DateRangeCalendar
                          from={customFrom}
                          to={customTo}
                          onFromChange={setCustomFrom}
                          onToChange={setCustomTo}
                        />
                        <button
                          type="button"
                          onClick={handleApplyCustom}
                          disabled={customFrom == null || customTo == null || customFrom > customTo}
                          className="mt-3 w-full px-3 py-1.5 rounded text-xs font-medium bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Apply
                        </button>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
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
