import { cn } from "@/lib/utils";

export type StatusTone = "warning" | "info" | "success" | "danger";

const toneClasses: Record<StatusTone, string> = {
  warning: "bg-warning-soft text-warning border-warning/30",
  info: "bg-info-soft text-link border-link/30",
  success: "bg-success-soft text-success border-success/30",
  danger: "bg-destructive-soft text-destructive border-destructive/30",
};

export function StatusBadge({ label, tone, className }: { label: string; tone: StatusTone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
        toneClasses[tone],
        className
      )}
    >
      {label}
    </span>
  );
}
