import { useState } from "react";
import { DriverScheduleStop } from "@shared/api";
import { Button } from "@/components/ui/button";
import { PageDialog } from "@/components/shared/PageDialog";
import { DeliveryPaymentPrompt } from "@/components/shared/DeliveryPaymentPrompt";
import { useAuth } from "@/hooks/useAuth";
import { useCan } from "@/hooks/useCan";

const statusBadge: Record<DriverScheduleStop["status"], { label: string; className: string }> = {
  pending: { label: "Pending", className: "badge-red" },
  in_transit: { label: "In transit", className: "badge-green" },
  completed: { label: "Completed", className: "badge-green" },
};

function formatPeso(value: string | null) {
  return `₱${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export function DriverStopCard({ stop, index, onChanged }: { stop: DriverScheduleStop; index: number; onChanged: () => void }) {
  const customer = stop.destination_customer;
  const badge = statusBadge[stop.status];
  const token = useAuth((state) => state.token);
  const canConfirm = useCan("delivery:confirm");
  const [mode, setMode] = useState<"confirm" | "payment" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeDialog = () => {
    setMode(null);
    setError(null);
  };

  // Same request bodies as the agent schedule (AgentDeliverySchedule) so the server rules apply unchanged.
  const submit = async (isPaid: boolean, paymentAmount?: number, paymentMethod?: string, paymentReference?: string) => {
    if (!token || !mode) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/deliveries/${stop.delivery_id}/items/${stop.id}/${mode === "payment" ? "payment" : "confirm"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(mode === "payment"
          ? { payment_amount: paymentAmount, payment_method: paymentMethod, payment_reference: paymentReference }
          : { is_paid: isPaid, payment_amount: paymentAmount, payment_method: paymentMethod, payment_reference: paymentReference }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Could not save. Try again.");
      }
      closeDialog();
      onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const outstanding = stop.outstanding_amount;
  const invoiceTotal = Number(stop.invoice.total_amount ?? 0);

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-navy-mid flex items-center justify-center shrink-0">
          <span className="font-rajdhani font-bold text-sm text-white">{index}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground text-sm truncate">{customer.store_name}</div>
          <div className="text-xs text-muted-foreground">
            {[customer.street_address, customer.location].filter(Boolean).join(", ") || "No address"}
          </div>
          {customer.contact_person && (
            <div className="text-xs text-muted-foreground">
              {customer.contact_person}
              {customer.contact_info ? ` · ${customer.contact_info}` : ""}
            </div>
          )}
        </div>
        <span className={`shrink-0 inline-block px-2 py-0.5 rounded text-xs font-bold ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      <ul className="text-sm text-foreground divide-y divide-border border-y border-border">
        {stop.invoice.invoice_items.map((item) => (
          <li key={item.id} className="flex justify-between py-1.5">
            <span className="truncate pr-3">{item.product_name}</span>
            <span className="font-semibold shrink-0">× {item.qty_ordered}</span>
          </li>
        ))}
      </ul>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{stop.invoice.receipt_number ? `Invoice ${stop.invoice.receipt_number}` : "Invoice"} · {stop.invoice.payment_status}</span>
        <span className="font-semibold text-foreground">{formatPeso(stop.invoice.total_amount)}</span>
      </div>

      {canConfirm && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {stop.status === "completed" && stop.is_paid ? (
            <p className="text-xs font-semibold text-green">Paid</p>
          ) : stop.status === "completed" ? (
            <>
              <p className="text-xs font-semibold text-warning">
                {outstanding < invoiceTotal
                  ? `Partially paid · ${formatPeso(String(outstanding))} remaining`
                  : "Not paid · recorded in Accounts Receivable"}
              </p>
              <Button type="button" variant="success" className="min-h-10" onClick={() => setMode("payment")}>
                Record payment
              </Button>
            </>
          ) : (
            <Button type="button" variant="success" className="min-h-10 w-full" onClick={() => setMode("confirm")}>
              Confirm delivery
            </Button>
          )}
        </div>
      )}

      {mode && (
        <PageDialog onClose={() => !isSaving && closeDialog()} label={mode === "payment" ? "Record payment" : "Confirm delivery"}>
          <DeliveryPaymentPrompt
            stop={stop}
            mode={mode}
            isConfirming={isSaving}
            error={error}
            onClose={closeDialog}
            onConfirm={submit}
          />
        </PageDialog>
      )}
    </div>
  );
}
