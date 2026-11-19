import type { PalletProductBatchLine } from "./palletUtils";

export function PalletBatchBreakdown({ lines }: { lines: PalletProductBatchLine[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {lines.map((line) => (
        <li key={line.batchItemId} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">From {line.batchName}</span>
          <span className="shrink-0 font-semibold tabular-nums text-foreground">{line.qty} units</span>
        </li>
      ))}
    </ul>
  );
}
