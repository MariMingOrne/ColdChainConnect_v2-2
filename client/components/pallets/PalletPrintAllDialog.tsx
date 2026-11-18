import JsBarcode from "jsbarcode";
import { ArrowLeft, Printer } from "lucide-react";
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
    <div className="bulk-pallet-print-overlay flex-1 flex flex-col gap-6 p-4 md:p-6">
      <section className="bulk-pallet-print-dialog flex w-full max-w-4xl flex-col gap-4">
        <div className="no-print page-header">
          <div>
            <h1 id="bulk-pallet-print-title" className="page-title">Print all pallets</h1>
            <p className="page-subtitle">{formattedDate} · {entries.length} pallet{entries.length === 1 ? "" : "s"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => window.print()} disabled={entries.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-accent-2 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <Printer size={16} /> Print all
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">
              <ArrowLeft size={15} />
              Back
            </button>
          </div>
        </div>

        <div className="no-print rounded-2xl border border-border bg-card p-5">
          {entries.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No pallets were created on this date.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {entries.map(({ pallet, customer }) => (
                <article key={pallet.id} className="rounded-lg border border-border p-3 text-center">
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
            @page { size: letter; margin: 0.35in; }
            html, body { height: auto !important; overflow: visible !important; }
            body * { visibility: hidden !important; }
            .bulk-pallet-print-overlay, .bulk-pallet-print-overlay * { visibility: visible !important; }
            .bulk-pallet-print-overlay { position: absolute !important; top: 0 !important; left: 0 !important; display: block !important; width: 100% !important; padding: 0 !important; background: transparent !important; }
            .bulk-pallet-print-dialog { display: block !important; width: 100% !important; max-width: none !important; max-height: none !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
            .bulk-pallet-print-content { display: block !important; }
            .bulk-pallet-print-grid { display: grid !important; grid-template-columns: 1fr; gap: 0.15in; }
            .bulk-pallet-label { break-inside: avoid; min-height: 1.55in; }
            .no-print { display: none !important; }
          }
        `}</style>
      </section>
    </div>
  );
}
