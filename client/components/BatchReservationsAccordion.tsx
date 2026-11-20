import { Link } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { BatchReservation } from "@shared/api";

interface BatchReservationsAccordionProps {
  reservations: BatchReservation[];
}

export function BatchReservationsAccordion({ reservations }: BatchReservationsAccordionProps) {
  if (reservations.length === 0) return null;

  const totalUnits = reservations.reduce((sum, row) => sum + row.qty, 0);

  return (
    <Accordion type="single" collapsible className="px-3 border-t border-border">
      <AccordionItem value="reservations" className="border-b-0">
        <AccordionTrigger className="py-2 text-xs font-semibold text-muted-foreground">
          <span>Reserved for unshipped orders</span>
          <span className="font-normal">
            {reservations.length} reservation{reservations.length !== 1 ? "s" : ""} · {totalUnits} unit{totalUnits !== 1 ? "s" : ""}
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-3">
          <ul className="space-y-2">
            {reservations.map((row, index) => (
              <li key={`${row.orderId}-${row.productId}-${index}`}>
                <Link
                  to={`/booking-dispatch/inventory?order=${encodeURIComponent(row.orderId)}`}
                  className="group flex items-start justify-between gap-3 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground group-hover:underline">
                      {row.productName}
                      {row.sku && <span className="font-normal text-muted-foreground"> · {row.sku}</span>}
                    </div>
                    <div className="truncate text-muted-foreground">{row.customerName} · Order {row.orderId}</div>
                  </div>
                  <span className="shrink-0 font-semibold text-foreground">{row.qty} unit{row.qty !== 1 ? "s" : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
