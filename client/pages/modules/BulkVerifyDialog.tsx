import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { paymentNeedsClearance, type UnverifiedPayment } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatPeso, responseError } from "@/lib/format";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function BulkVerifyDialog({
  payments,
  token,
  onClose,
  onDone,
  onVerified,
}: {
  payments: UnverifiedPayment[];
  token: string | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
  onVerified: () => void;
}) {
  const [items, setItems] = useState(payments);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const missingRemarks = items.some((payment) => paymentNeedsClearance(payment.payment_method) && !remarks[payment.id]?.trim());
  const total = items.reduce((sum, payment) => sum + Number(payment.amount), 0);

  const verifyAll = async () => {
    setBusy(true);
    const failed: UnverifiedPayment[] = [];
    let verifiedCount = 0;
    let firstError = "";

    for (const payment of items) {
      try {
        const res = await fetch(`/api/payments/${payment.id}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ remarks: remarks[payment.id]?.trim() || undefined }),
        });
        if (res.ok) {
          verifiedCount += 1;
          continue;
        }
        firstError ||= await responseError(res, "Could not verify this payment");
      } catch (error) {
        firstError ||= error instanceof Error ? error.message : "Could not verify this payment";
      }
      failed.push(payment);
    }

    setBusy(false);
    await onDone();

    if (failed.length === 0) {
      toast.success(`Verified ${plural(verifiedCount, "payment")}`);
      onVerified();
      return;
    }

    setItems(failed);
    toast.error(`${verifiedCount} verified, ${plural(failed.length, "payment")} failed. ${firstError}`);
  };

  return (
    <div className="space-y-5 px-4 py-4 md:px-6 md:py-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Verify selected payments</h1>
          <p className="page-subtitle">Add remarks for each payment, then confirm them together. Total {formatPeso(total)}.</p>
        </div>
      </div>

      <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
        {items.map((payment) => {
          const needsClearance = paymentNeedsClearance(payment.payment_method);
          return (
            <div key={payment.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{payment.customer_name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{payment.receipt_number} · {payment.invoice_receipt_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{formatPeso(payment.amount)}</p>
                  <p className="text-xs capitalize text-muted-foreground">{payment.payment_method?.replace(/_/g, " ") || "—"}</p>
                </div>
              </div>
              <Textarea
                aria-label={`Remarks for ${payment.receipt_number}`}
                value={remarks[payment.id] ?? ""}
                rows={2}
                maxLength={500}
                onChange={(event) => setRemarks((current) => ({ ...current, [payment.id]: event.target.value }))}
                placeholder={needsClearance ? "Clearance remark (required)" : "Remarks (optional)"}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        {missingRemarks && (
          <p className="mr-auto text-xs text-muted-foreground">Add a clearance remark for each bank transfer or check payment.</p>
        )}
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="button" variant="success" onClick={() => void verifyAll()} disabled={busy || missingRemarks}>
          <BadgeCheck size={15} /> {busy ? "Verifying…" : `Verify ${plural(items.length, "payment")}`}
        </Button>
      </div>
    </div>
  );
}
