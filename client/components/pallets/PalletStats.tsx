import { CheckCircle2, FileEdit, Layers, Truck } from "lucide-react";
import { Pallet } from "@shared/api";
import { cn } from "@/lib/utils";

interface PalletStatsProps {
  pallets: Pallet[];
}

export function PalletStats({ pallets }: PalletStatsProps) {
  const countWithStatus = (status: Pallet["status"]) =>
    pallets.filter((pallet) => pallet.status === status).length;

  const cards = [
    { label: "Total pallets", value: pallets.length, icon: Layers, tone: "bg-primary/10 text-foreground" },
    { label: "Draft", value: countWithStatus("draft"), icon: FileEdit, tone: "bg-warning-soft text-warning" },
    { label: "In transit", value: countWithStatus("approved"), icon: CheckCircle2, tone: "bg-success-soft text-success" },
    { label: "Shipped", value: countWithStatus("shipped"), icon: Truck, tone: "bg-info-soft text-link" },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, tone }) => (
        <div key={label} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg", tone)}>
            <Icon size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
