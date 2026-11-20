import { todayInManila } from "@shared/api";

export const paymentPeriodOptions = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "thisWeek", label: "This week" },
  { value: "last7", label: "Last 7 days" },
  { value: "thisMonth", label: "This month" },
  { value: "last30", label: "Last 30 days" },
];

const presetValues = new Set(paymentPeriodOptions.map((option) => option.value));
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

export interface DayBounds {
  from: string;
  to: string;
}

export function isSpecificDay(period: string): boolean {
  return dayPattern.test(period);
}

export function parsePeriod(value: string | null): string {
  if (!value) return "all";
  return presetValues.has(value) || isSpecificDay(value) ? value : "all";
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Inclusive Manila business days a period covers; null means every date. */
export function periodBounds(period: string, today = todayInManila()): DayBounds | null {
  if (isSpecificDay(period)) return { from: period, to: period };
  switch (period) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const day = shiftDay(today, -1);
      return { from: day, to: day };
    }
    case "thisWeek": {
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
      const from = shiftDay(today, -((weekday + 6) % 7));
      return { from, to: shiftDay(from, 6) };
    }
    case "last7":
      return { from: shiftDay(today, -6), to: today };
    case "thisMonth":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last30":
      return { from: shiftDay(today, -29), to: today };
    default:
      return null;
  }
}

export function formatBusinessDay(day: string): string {
  return new Date(`${day}T00:00:00+08:00`).toLocaleDateString("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" });
}

export function formatPeriod(bounds: DayBounds | null): string {
  if (!bounds) return "All dates";
  if (bounds.from === bounds.to) return formatBusinessDay(bounds.from);
  return `${formatBusinessDay(bounds.from)} – ${formatBusinessDay(bounds.to)}`;
}
