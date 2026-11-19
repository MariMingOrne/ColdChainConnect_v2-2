import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface DateRange {
  from: string;
  to: string;
}

/** Holds a from/to date range and the query string to append to an API path. */
export function useDateRange() {
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    const text = params.toString();
    return text ? `?${text}` : "";
  }, [range]);
  return { range, setRange, query };
}

interface DateRangeFilterProps {
  range: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangeFilter({ range, onChange }: DateRangeFilterProps) {
  const reversed = Boolean(range.from && range.to && range.from > range.to);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        From
        <Input
          type="date"
          aria-label="From date"
          value={range.from}
          max={range.to || undefined}
          onChange={(event) => onChange({ ...range, from: event.target.value })}
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        To
        <Input
          type="date"
          aria-label="To date"
          value={range.to}
          min={range.from || undefined}
          onChange={(event) => onChange({ ...range, to: event.target.value })}
        />
      </label>
      {(range.from || range.to) && (
        <Button type="button" variant="outline" onClick={() => onChange({ from: "", to: "" })}>
          Clear dates
        </Button>
      )}
      {reversed && <p role="alert" className="text-xs text-red">"From" is after "To".</p>}
    </div>
  );
}
