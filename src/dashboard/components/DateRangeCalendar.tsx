import { useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isBefore,
  isAfter,
  startOfDay,
} from "date-fns";

const WEEK_STARTS_ON = 0; // Sunday

interface MiniCalendarProps {
  value: Date | null;
  onChange: (d: Date) => void;
  minDate?: Date | null;
  maxDate?: Date | null;
  label: string;
}

function MiniCalendar({ value, onChange, minDate, maxDate, label }: MiniCalendarProps) {
  const [viewDate, setViewDate] = useState(() => value ?? new Date());

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON });
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(gridStart, i));
  }

  const isDisabled = (d: Date) => {
    if (minDate != null && isBefore(d, startOfDay(minDate))) return true;
    if (maxDate != null && isAfter(d, startOfDay(maxDate))) return true;
    return false;
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-300">{label}</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setViewDate((d) => subMonths(d, 1))}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="text-xs text-gray-300 min-w-[72px] text-center">
            {format(viewDate, "MMM yyyy")}
          </span>
          <button
            type="button"
            onClick={() => setViewDate((d) => addMonths(d, 1))}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((w) => (
          <div key={w} className="text-[10px] text-gray-500 py-0.5">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const inMonth = isSameMonth(d, monthStart);
          const selected = value != null && isSameDay(d, value);
          const disabled = isDisabled(d);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => !disabled && onChange(startOfDay(d))}
              disabled={disabled}
              className={`
                w-7 h-7 text-xs rounded
                ${!inMonth ? "text-gray-600" : "text-gray-200"}
                ${selected ? "bg-gray-600 text-white" : "hover:bg-gray-700"}
                ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface DateRangeCalendarProps {
  from: Date | null;
  to: Date | null;
  onFromChange: (d: Date) => void;
  onToChange: (d: Date) => void;
}

export function DateRangeCalendar({ from, to, onFromChange, onToChange }: DateRangeCalendarProps) {
  const today = startOfDay(new Date());
  return (
    <div className="flex gap-4">
      <MiniCalendar
        label="Start"
        value={from}
        onChange={onFromChange}
        maxDate={to ?? today}
      />
      <MiniCalendar
        label="End"
        value={to}
        onChange={onToChange}
        minDate={from}
        maxDate={today}
      />
    </div>
  );
}
