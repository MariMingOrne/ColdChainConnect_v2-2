import { InventoryBatch, Pallet, PalletItem } from "@shared/api";

export function palletItemTotal(item: PalletItem): number {
  return item.qty_units * Number(item.unit_cost);
}

export function palletTotal(pallet: Pallet): number {
  return (pallet.items ?? []).reduce((sum, item) => sum + palletItemTotal(item), 0);
}

export interface PalletProductBatchLine {
  batchItemId: string;
  batchName: string;
  qty: number;
}

export interface PalletProductGroup {
  productId: string;
  unitCost: string;
  qty: number;
  value: number;
  batches: PalletProductBatchLine[];
}

export function groupPalletItemsByProduct(items: PalletItem[], batches: InventoryBatch[]): PalletProductGroup[] {
  const batchNameByItemId = new Map(
    batches.flatMap((batch) => (batch.items ?? []).map((item) => [item.id, batch.name] as const)),
  );
  const groups = new Map<string, PalletProductGroup>();

  for (const item of items) {
    const group = groups.get(item.product_id) ?? {
      productId: item.product_id,
      unitCost: item.unit_cost,
      qty: 0,
      value: 0,
      batches: [],
    };
    let line = group.batches.find((entry) => entry.batchItemId === item.batch_item_id);
    if (!line) {
      line = {
        batchItemId: item.batch_item_id,
        batchName: batchNameByItemId.get(item.batch_item_id) ?? "Unknown batch",
        qty: 0,
      };
      group.batches.push(line);
    }
    line.qty += item.qty_units;
    group.qty += item.qty_units;
    group.value += palletItemTotal(item);
    groups.set(item.product_id, group);
  }

  return [...groups.values()];
}

export function batchSummary(batches: PalletProductBatchLine[]): string {
  return batches.length === 1 ? `From ${batches[0].batchName}` : `From ${batches.length} batches`;
}

export function formatMoney(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const palletStatusLabels: Record<Pallet["status"], string> = {
  draft: "Draft",
  prepared: "Prepared",
  approved: "In transit",
  shipped: "Shipped",
};

export const palletStatusOptions: { value: Pallet["status"]; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "prepared", label: "Prepared" },
  { value: "approved", label: "In transit" },
  { value: "shipped", label: "Shipped" },
];

export type DatePresetFilter = "all" | "today" | "yesterday" | "thisWeek" | "last7" | "thisMonth" | "last30";

export const datePresetOptions: { value: DatePresetFilter; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "thisWeek", label: "This week" },
  { value: "last7", label: "Last 7 days" },
  { value: "thisMonth", label: "This month" },
  { value: "last30", label: "Last 30 days" },
];

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function datePresetRange(preset: Exclude<DatePresetFilter, "all">, now: Date): { start: Date; end: Date } {
  const today = addDays(now, 0);
  const tomorrow = addDays(today, 1);
  switch (preset) {
    case "today":
      return { start: today, end: tomorrow };
    case "yesterday":
      return { start: addDays(today, -1), end: today };
    case "thisWeek": {
      const mondayOffset = (today.getDay() + 6) % 7;
      return { start: addDays(today, -mondayOffset), end: addDays(today, 7 - mondayOffset) };
    }
    case "last7":
      return { start: addDays(today, -6), end: tomorrow };
    case "thisMonth":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    case "last30":
      return { start: addDays(today, -29), end: tomorrow };
  }
}

export function isInDatePreset(isoDate: string, preset: DatePresetFilter, now = new Date()): boolean {
  if (preset === "all") return true;
  const date = new Date(isoDate);
  const { start, end } = datePresetRange(preset, now);
  return date >= start && date < end;
}

export const palletStatusStyles: Record<Pallet["status"], string> = {
  draft: "bg-warning-soft text-warning border-warning/30",
  prepared: "bg-warning-soft text-warning border-warning/30",
  approved: "bg-success-soft text-success border-success/30",
  shipped: "bg-info-soft text-link border-link/30",
};
