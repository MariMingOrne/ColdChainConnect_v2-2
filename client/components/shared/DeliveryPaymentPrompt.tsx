import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface DeliveryPaymentTarget {
  destination_customer: { store_name: string };
  invoice: { id: string; receipt_number?: string | null; total_amount?: string | null; credit_applied_amount?: string | null } | null;
  outstanding_amount?: number;
}

/** Confirm a delivery (with the payment collected at the door) or record a later payment on it. */
export function DeliveryPaymentPrompt({ stop, mode, isConfirming, error, onClose, onConfirm }: {
  stop: DeliveryPaymentTarget;
  mode: "confirm" | "payment";
  isConfirming: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (isPaid: boolean, paymentAmount?: number, paymentMethod?: string, paymentReference?: string, paymentId?: string, notes?: string) => Promise<void>;
}) {
  const isRecordingPayment = mode === "payment";
  const invoiceAmount = Math.max(0, Number(stop.invoice?.total_amount ?? 0) - Number(stop.invoice?.credit_applied_amount ?? 0));
  const amountDue = isRecordingPayment ? Number(stop.outstanding_amount ?? invoiceAmount) : invoiceAmount;
  const creditSettled = !isRecordingPayment && amountDue === 0;
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "partial" | "unpaid">(isRecordingPayment ? "paid" : "unpaid");
  const [paymentAmount, setPaymentAmount] = useState(amountDue.toFixed(2));
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentId] = useState(() => crypto.randomUUID());
  const paymentMethods = [
    ["cash", "Cash"],
    ["check", "Check"],
    ["bank_transfer", "Bank transfer"],
    ["online", "Online payment"],
  ];

  return (
    <div className="flex-1 flex flex-col gap-5 p-6 pb-24 md:pb-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isRecordingPayment ? "Record payment" : "Confirm delivery"}</h1>
        </div>
      </div>
      <section className="max-w-lg w-full rounded-2xl bg-card p-5 shadow-sm">
        <p className="mt-2 text-sm text-muted-foreground">
          {creditSettled
            ? `This order is covered by ${stop.destination_customer.store_name}'s available credit.`
            : isRecordingPayment
              ? `Record payment collected from ${stop.destination_customer.store_name}.`
              : `How much payment was received from ${stop.destination_customer.store_name}?`}
        </p>
        {stop.invoice && (
          <p className="mt-2 text-sm font-semibold text-foreground">
            Invoice {stop.invoice.receipt_number || stop.invoice.id.slice(0, 8)} · {isRecordingPayment ? "Outstanding balance" : "Amount due"} ₱{amountDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        )}
        {!isRecordingPayment && !creditSettled && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {([ ["paid", "Paid"], ["partial", "Partial"], ["unpaid", "Not paid"] ] as const).map(([value, label]) => (
              <Button key={value} type="button" variant={paymentStatus === value ? value === "unpaid" ? "accent" : "success" : "outline"} className="min-h-12 h-auto px-2 text-sm" onClick={() => { setPaymentStatus(value); setPaymentAmount(value === "paid" ? amountDue.toFixed(2) : value === "partial" ? "" : "0.00"); }}>{label}</Button>
            ))}
          </div>
        )}
        {!creditSettled && (isRecordingPayment || paymentStatus !== "unpaid") ? (
          <div className="mt-4 space-y-3 rounded-lg bg-success-soft p-4">
            {(isRecordingPayment || paymentStatus === "partial") && (
              <p className="text-xs text-muted-foreground">Remaining after payment: ₱{Math.max(0, amountDue - (Number(paymentAmount) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            )}
            {(Number(paymentAmount) || 0) > amountDue && (
              <p className="text-xs font-semibold text-success">Credit for next order: ₱{((Number(paymentAmount) - amountDue)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            )}
            <label className="block text-xs font-semibold text-foreground">
              Amount collected (₱)
              <Input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => { const value = event.target.value; setPaymentAmount(value); if (!isRecordingPayment) setPaymentStatus(Number(value) >= amountDue ? "paid" : "partial"); }} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal" />
            </label>
            <label className="block text-xs font-semibold text-foreground">
              Payment method
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger aria-label="Payment method" className="mt-1 font-normal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="block text-xs font-semibold text-foreground">
              Reference / receipt number (optional)
              <Input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal" />
            </label>
            <label className="block text-xs font-semibold text-foreground">
              Notes (optional)
              <Textarea value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal" />
            </label>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-warning/30 bg-warning-soft p-3 text-xs text-warning">The outstanding balance will be recorded in Accounts Receivable.</p>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-red">{error}</p>}
        <div className="mt-5 flex gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isConfirming} className="min-h-11 h-auto flex-1">Cancel</Button>
          <Button type="button" variant="success" onClick={() => void onConfirm(creditSettled || paymentStatus === "paid", creditSettled || paymentStatus === "unpaid" ? 0 : Number(paymentAmount), creditSettled || paymentStatus === "unpaid" ? undefined : paymentMethod, creditSettled || paymentStatus === "unpaid" ? undefined : paymentReference, paymentId, creditSettled || paymentStatus === "unpaid" ? undefined : paymentNotes)} disabled={isConfirming || (!creditSettled && paymentStatus !== "unpaid" && (!Number.isFinite(Number(paymentAmount)) || Number(paymentAmount) <= 0 || (!isRecordingPayment && paymentStatus === "partial" && Number(paymentAmount) >= amountDue)))} className="min-h-11 h-auto flex-1">{isConfirming ? "Saving…" : isRecordingPayment ? "Save payment" : "Confirm delivery"}</Button>
        </div>
      </section>
    </div>
  );
}
