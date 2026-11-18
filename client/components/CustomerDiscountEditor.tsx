import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

export interface DiscountRow {
  label: string;
  percent: string;
}

export function formatPercent(rate: number): number {
  return Number((rate * 100).toFixed(2));
}

export function CustomerDiscountEditor({
  rows,
  onChange,
}: {
  rows: DiscountRow[];
  onChange: (rows: DiscountRow[]) => void;
}) {
  const updateRow = (index: number, patch: Partial<DiscountRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

  const totalPercent = rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0);

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            type="text"
            value={row.label}
            onChange={(e) => updateRow(index, { label: e.target.value })}
            placeholder="e.g., Prompt payment"
            className="flex-1"
          />
          <div className="relative w-24">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={row.percent}
              onChange={(e) => updateRow(index, { percent: e.target.value })}
              placeholder="5"
              className="w-full"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
          <button
            type="button"
            onClick={() => removeRow(index)}
            aria-label="Remove discount"
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-red"
          >
            <X size={16} />
          </button>
        </div>
      ))}

      <Button
        type="button"
        onClick={() => onChange([...rows, { label: "", percent: "" }])}
        variant="link" className="h-auto p-0"
      >
        <Plus size={14} /> Add discount
      </Button>

      <p className="text-xs text-muted-foreground">
        Discounts stack. Total discount: {formatPercent(totalPercent / 100)}%
      </p>
    </div>
  );
}
