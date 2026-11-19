import { Boxes, ChevronDown, ChevronUp, Package } from "lucide-react";
import { useState } from "react";
import type { Pallet } from "@shared/api";
import { PalletStatusBadge } from "@/components/pallets/PalletTable";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export interface TruckLoadStop {
  id: string;
  customerName: string;
  receipt?: string | null;
  runLabel: string;
  pallets: Pallet[];
}

interface TruckLoadProps {
  stops: TruckLoadStop[];
  productNames: Map<string, string>;
}

const unitsOf = (pallet: Pallet) => (pallet.items ?? []).reduce((sum, item) => sum + item.qty_units, 0);

function PalletCard({ pallet, productNames }: { pallet: Pallet; productNames: Map<string, string> }) {
  const [open, setOpen] = useState(false);
  const items = pallet.items ?? [];
  return (
    <div className="rounded-lg border border-border bg-muted">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Package size={15} className="flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate font-mono text-xs text-foreground">{pallet.id.slice(0, 8)}…</span>
          <PalletStatusBadge status={pallet.status} />
        </span>
        <span className="flex flex-shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {items.length} item{items.length === 1 ? "" : "s"} · {unitsOf(pallet)} units
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {items.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">No items on this pallet.</li>
          ) : (
            items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <span className="min-w-0 truncate text-foreground">{productNames.get(item.product_id) ?? item.product_id.slice(0, 8)}</span>
                <span className="flex-shrink-0 font-semibold text-foreground">× {item.qty_units}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export function TruckLoad({ stops, productNames }: TruckLoadProps) {
  const palletCount = stops.reduce((sum, stop) => sum + stop.pallets.length, 0);
  const unitCount = stops.reduce((sum, stop) => sum + stop.pallets.reduce((inner, pallet) => inner + unitsOf(pallet), 0), 0);

  return (
    <Accordion type="single" collapsible defaultValue="truck-load" className="rounded-xl border border-border bg-card px-4" aria-label="Truck load">
      <AccordionItem value="truck-load" className="border-b-0">
        <AccordionTrigger className="hover:no-underline">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex items-center gap-2 font-rajdhani text-xl font-bold text-foreground">
              <Boxes size={18} aria-hidden="true" />
              Truck Load
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {palletCount} pallet{palletCount === 1 ? "" : "s"} · {unitCount} units
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 px-0">
          {palletCount === 0 ? (
            <p className="rounded-lg bg-muted p-4 text-center text-xs text-muted-foreground">
              Nothing is loaded. Pallets appear here once a scheduled run has stops with prepared pallets.
            </p>
          ) : (
            <div className="space-y-4">
              {stops.filter((stop) => stop.pallets.length > 0).map((stop) => (
                <div key={stop.id} className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-semibold text-foreground">{stop.customerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {stop.receipt ? `${stop.receipt} · ` : ""}{stop.runLabel}
                    </p>
                  </div>
                  {stop.pallets.map((pallet) => <PalletCard key={pallet.id} pallet={pallet} productNames={productNames} />)}
                </div>
              ))}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
