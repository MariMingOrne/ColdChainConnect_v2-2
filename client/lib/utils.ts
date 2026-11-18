import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₱191,520.00 — one money format for the whole app. Accepts numbers or decimal strings from the API. */
export function formatPeso(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return pesoFormatter.format(Number.isFinite(n) ? n : 0);
}
