import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { BatchReservation } from "@shared/api";

interface BatchReservationsAccordionProps {
  batches: Array<{ id: string; name: string }>;
  reservations: Record<string, BatchReservation[]>;
}

export function BatchReservationsAccordion({ batches, reservations }: BatchReservationsAccordionProps) {
  const reservedBatches = batches.filter((batch) => (reservations[batch.id]?.length ?? 0) > 0);
  if (reservedBatches.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      <h3 className="text-xs font-semibold text-muted-foreground mb-3">Reserved for unshipped orders</h3>
      <Accordion type="multiple" className="rounded-lg border border-border px-4">
        {reservedBatches.map((batch) => {
          const rows = reservations[batch.id];
          const totalUnits = rows.reduce((sum, row) => sum + row.qty, 0);
          return (
            <AccordionItem key={batch.id} value={batch.id}>
              <AccordionTrigger className="text-sm text-foreground">
                <span>{batch.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {rows.length} reservation{rows.length !== 1 ? "s" : ""} · {totalUnits} unit{totalUnits !== 1 ? "s" : ""}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  {rows.map((row, index) => (
                    <li key={`${row.orderId}-${row.productId}-${index}`} className="flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">
                          {row.productName}
                          {row.sku && <span className="font-normal text-muted-foreground"> · {row.sku}</span>}
                        </div>
                        <div className="truncate text-muted-foreground">{row.customerName} · Order {row.orderId}</div>
                      </div>
                      <span className="shrink-0 font-semibold text-foreground">{row.qty} unit{row.qty !== 1 ? "s" : ""}</span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
