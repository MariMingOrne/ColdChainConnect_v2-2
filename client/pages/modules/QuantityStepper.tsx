import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

interface QuantityStepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function QuantityStepper({ value, min, max, onChange }: QuantityStepperProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const commit = () => {
    const parsed = parseInt(draft, 10);
    const next = Number.isNaN(parsed) ? value : clamp(parsed);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const step = (delta: number) => {
    const next = clamp(value + delta);
    if (next !== value) onChange(next);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        onClick={() => step(-1)}
        disabled={value <= min}
        aria-label="Decrease quantity" variant="outline" size="icon" className="h-7 w-7">
        <Minus size={14} />
      </Button>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(String(value));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            step(1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            step(-1);
          }
        }}
        aria-label="Quantity"
        className="w-12 px-1 py-1 border border-border rounded text-sm font-semibold text-foreground text-center focus:outline-none focus:border-accent-2"
      />
      <Button
        type="button"
        onClick={() => step(1)}
        disabled={value >= max}
        aria-label="Increase quantity" variant="outline" size="icon" className="h-7 w-7">
        <Plus size={14} />
      </Button>
    </div>
  );
}
