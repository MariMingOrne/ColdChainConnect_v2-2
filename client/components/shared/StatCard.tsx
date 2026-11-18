import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One figure with its label. The single stat-card style for every screen
 * (replaces the per-page StatsBox / SummaryCard copies). `attention` is the
 * only colour: use it when the figure means something needs doing.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  detail,
  attention = false,
  className,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  detail?: string;
  attention?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", attention ? "border-warning/40" : "border-border", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </div>
      <p className={cn("mt-1.5 font-rajdhani text-2xl font-bold tabular-nums", attention ? "text-warning" : "text-foreground")}>{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
