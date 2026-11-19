import { Button } from "@/components/ui/button";
import JsBarcode from "jsbarcode";
import { Printer } from "lucide-react";
import { useMemo } from "react";
import type { PalletEntry } from "./PalletTable";

function barcodeDataUrl(value: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, { format: "CODE128", displayValue: false, margin: 20, height: 64, width: 2 });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
}

export function PalletPrintAllDialog({ entries, date, onClose }: {
  entries: PalletEntry[];
  date: string;
  onClose: () => void;
}) {
  const formattedDate = new Date(`${date}T00:00:00`).toLocaleDateString();
  const barcodes = useMemo(() => Object.fromEntries(entries.map(({ pallet }) => [pallet.id, barcodeDataUrl(pallet.id)])), [entries]);

  return (
    <div className="bulk-pallet-print-overlay flex-1 flex flex-col gap-6 p-6">
      <section className="bulk-pallet-print-dialog flex w-full max-w-4xl flex-col gap-4">
        <div className="no-print page-header">
          <div>
            <h1 id="bulk-pallet-print-title" className="page-title">Print all pallets</h1>
            <p className="page-subtitle">{formattedDate} · {entries.length} pallet{entries.length === 1 ? "" : "s"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => window.print()} disabled={entries.length === 0} variant="default">
              <Printer size={16} /> Print all
            </Button>
          </div>
        </div>

        <div className="no-print rounded-2xl border border-border bg-white p-5 text-black">
          {entries.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No pallets were created on this date.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {entries.map(({ pallet, customer }) => (
                <article key={pallet.id} className="rounded-lg border border-black/20 bg-white p-3 text-center">
                  <p className="text-xs font-semibold text-foreground">{customer?.store_name ?? "Unknown customer"}</p>
                  <p className="mt-1 break-all font-mono text-2xs text-muted-foreground">{pallet.id}</p>
                  <img src={barcodes[pallet.id]} alt={`Barcode for pallet ${pallet.id}`} className="mx-auto mt-2 h-auto w-full object-contain" />
                </article>
              ))}
            </div>
          )}
        </div>

        <div id="bulk-pallet-print" className="bulk-pallet-print-content">
          <h1 className="mb-3 text-lg font-bold">Pallet Labels · {formattedDate}</h1>
          <div className="bulk-pallet-print-grid grid grid-cols-2 gap-3">
            {entries.map(({ pallet, customer }) => {
              const units = (pallet.items ?? []).reduce((sum, item) => sum + item.qty_units, 0);
              return (
                <article key={pallet.id} className="bulk-pallet-label flex flex-col items-center justify-center gap-1 rounded border border-black p-3 text-center">
                  <p className="text-xs font-bold">{customer?.store_name ?? "Unknown customer"} · {units} units</p>
                  <p className="break-all font-mono text-2xs">{pallet.id}</p>
                  <img src={barcodes[pallet.id]} alt={`Barcode for pallet ${pallet.id}`} className="h-auto w-full object-contain" />
                </article>
              );
            })}
          </div>
        </div>

        <style>{`
          #bulk-pallet-print { display: none; }
          @media print {
            @page { size: auto; margin: 0.35in; }
            html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
            body * { visibility: hidden !important; }
            body:has(#bulk-pallet-print) .fixed.inset-0 { display: none !important; }
            body:has(#bulk-pallet-print) [role="dialog"] {
              position: static !important; display: block !important; width: auto !important; max-width: none !important;
              max-height: none !important; overflow: visible !important; transform: none !important; border: 0 !important;
              padding: 0 !important; box-shadow: none !important; background: transparent !important;
            }
            #bulk-pallet-print, #bulk-pallet-print * { visibility: visible !important; }
            #bulk-pallet-print { position: relative !important; display: block !important; width: 100% !important; max-width: 7.5in; margin: 0 auto !important; background: #fff !important; color: #111 !important; }
            .bulk-pallet-print-grid { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.15in; }
            .bulk-pallet-label { break-inside: avoid; min-height: 1.55in; background: #fff !important; color: #111 !important; }
            .no-print { display: none !important; }
          }
        `}</style>
      </section>
    </div>
  );
}
