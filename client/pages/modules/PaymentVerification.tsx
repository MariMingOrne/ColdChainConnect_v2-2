import { useCallback, useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { paymentNeedsClearance, type UnverifiedPayment } from "@shared/api";
import { PageDialog } from "@/components/shared/PageDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { TablePagination, paginate } from "@/components/TablePagination";
import { TableToolbar } from "@/components/TableToolbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TruncatedText } from "@/components/ui/truncated-text";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useAuth } from "@/hooks/useAuth";
import { useCan } from "@/hooks/useCan";
import { formatPeso, responseError } from "@/lib/format";
import { useNewRows } from "@/lib/unseen";

const formatDate = (value: string) => new Date(value).toLocaleDateString("en-PH");

function VerifyDialog({
  payment,
  token,
  onClose,
  onDone,
}: {
  payment: UnverifiedPayment;
  token: string | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState("");
  const needsClearance = paymentNeedsClearance(payment.payment_method);
  const missingRemarks = needsClearance && !remarks.trim();

  const verify = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/receipts/${payment.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ remarks: remarks.trim() || undefined }),
      });
      if (!res.ok) {
        // 409 means it was already verified (or has no payment): show the server's reason and refresh the table.
        toast.error(await responseError(res, "Could not verify this payment"));
        await onDone();
        onClose();
        return;
      }
      toast.success("Payment verified");
      await onDone();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not verify this payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 px-4 py-4 md:px-6 md:py-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Verify payment</h1>
          <p className="page-subtitle">Confirm the money recorded in the field was received.</p>
        </div>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        {[
          ["Customer", payment.customer_name],
          ["Receipt / invoice", `${payment.receipt_number} · ${payment.invoice_receipt_number}`],
          ["Amount", formatPeso(payment.amount)],
          ["Method", payment.payment_method?.replace("_", " ") || "—"],
          ...(payment.payment_reference ? [["Reference no.", payment.payment_reference]] : []),
          ["Recorded by", payment.recorded_by_username || "—"],
          ["Date", formatDate(payment.confirmed_at)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="mb-1 text-xs font-semibold text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium capitalize text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <label className="grid gap-1.5 text-sm font-semibold text-foreground">
        Clearance remarks{needsClearance ? " (required)" : " (optional)"}
        <Textarea
          value={remarks}
          rows={3}
          maxLength={500}
          onChange={(event) => setRemarks(event.target.value)}
          placeholder={needsClearance ? "e.g. Cleared in the bank account on Nov 20, ref matches" : "Anything Accounting should note"}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="button" variant="success" onClick={() => void verify()} disabled={busy || missingRemarks}>
          <BadgeCheck size={15} /> {busy ? "Verifying…" : "Confirm payment received"}
        </Button>
      </div>
    </div>
  );
}

export function PaymentVerification() {
  const isNewRow = useNewRows("payments");
  const { token } = useAuth();
  const canVerify = useCan("payment:verify");
  const [payments, setPayments] = useState<UnverifiedPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [verifying, setVerifying] = useState<UnverifiedPayment | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/payments/unverified", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await responseError(res, "Failed to load payments"));
      setPayments(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);
  useAutoRefresh(fetchData, { enabled: Boolean(token) });

  const query = searchTerm.trim().toLowerCase();
  const filtered = payments.filter(
    (payment) =>
      !query ||
      [payment.customer_name, payment.receipt_number, payment.invoice_receipt_number, payment.recorded_by_username].some((value) =>
        value?.toLowerCase().includes(query),
      ),
  );
  const { currentPage, totalPages, pageItems } = paginate(filtered, page);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="page-title">Payments to verify</h1>
        <p className="page-subtitle">Payments drivers and agents recorded on deliveries, waiting for Accounting</p>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive-soft p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      <TableToolbar
        searchValue={searchTerm}
        onSearchChange={(value) => { setSearchTerm(value); setPage(1); }}
        searchPlaceholder="Search by customer, receipt or recorder…"
      />

      <Card className="overflow-hidden rounded-xl shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Receipt / invoice</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Recorded by</TableHead>
              <TableHead>Date</TableHead>
              {canVerify && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canVerify ? 6 : 5} className="py-10 text-center text-sm text-muted-foreground">
                  {payments.length === 0 ? "No payments are waiting to be verified." : "No payments match your search."}
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((payment) => (
                <TableRow key={payment.id} className={isNewRow(payment.confirmed_at) ? "row-new" : undefined}>
                  <TableCell className="max-w-[220px] text-sm font-semibold text-foreground">
                    <TruncatedText>{payment.customer_name}</TruncatedText>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {payment.receipt_number} · {payment.invoice_receipt_number}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm font-bold">{formatPeso(payment.amount)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{payment.recorded_by_username || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(payment.confirmed_at)}</TableCell>
                  {canVerify && (
                    <TableCell className="text-right">
                      <Button variant="success" size="sm" onClick={() => setVerifying(payment)}>
                        <BadgeCheck size={13} /> Verify
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination page={currentPage} totalPages={totalPages} totalItems={filtered.length} onPageChange={setPage} />
      </Card>

      {verifying && (
        <PageDialog onClose={() => setVerifying(null)} label="Verify payment">
          <VerifyDialog payment={verifying} token={token} onClose={() => setVerifying(null)} onDone={fetchData} />
        </PageDialog>
      )}
    </div>
  );
}
