import { create } from "zustand";

export type TimeRangePreset = "7d" | "30d" | "90d" | "all";

export interface DashboardState {
  selectedMarketId: string | null;
  selectedBorrowerAddress: string | null;
  timeRangePreset: TimeRangePreset;
  /** Unix seconds; derived from preset or custom. */
  fromTimestamp: number | null;
  toTimestamp: number | null;
  setSelectedMarketId: (id: string | null) => void;
  setSelectedBorrowerAddress: (address: string | null) => void;
  setTimeRangePreset: (preset: TimeRangePreset) => void;
  setCustomTimeRange: (from: number | null, to: number | null) => void;
  /** Call after setting preset to refresh from/to from current time. */
  getTimeRange: () => { from: number | null; to: number | null };
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  selectedMarketId: null,
  selectedBorrowerAddress: null,
  timeRangePreset: "all",
  fromTimestamp: null,
  toTimestamp: null,

  setSelectedMarketId: (id) => set({ selectedMarketId: id }),

  setSelectedBorrowerAddress: (address) => set({ selectedBorrowerAddress: address }),

  setTimeRangePreset: (preset) => {
    const now = Math.floor(Date.now() / 1000);
    const day = 86400;
    let from: number | null = null;
    let to: number | null = preset === "all" ? null : now;
    if (preset === "7d") from = now - 7 * day;
    else if (preset === "30d") from = now - 30 * day;
    else if (preset === "90d") from = now - 90 * day;
    set({ timeRangePreset: preset, fromTimestamp: from, toTimestamp: to });
  },

  setCustomTimeRange: (from, to) =>
    set({ fromTimestamp: from, toTimestamp: to, timeRangePreset: "all" }),

  getTimeRange: () => {
    const { timeRangePreset, fromTimestamp, toTimestamp } = get();
    if (timeRangePreset !== "all" || fromTimestamp != null || toTimestamp != null) {
      return { from: fromTimestamp, to: toTimestamp };
    }
    return { from: null, to: null };
  },
}));
