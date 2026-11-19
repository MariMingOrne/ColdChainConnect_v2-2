import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Banknote, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  CASH_DENOMINATIONS,
  denominationTotalCents,
  todayInManila,
  type CashCollectionRow,
  type CashDenomination,
  type CashRemittance,
  type DenominationCounts,
} from "@shared/api";
import { PageDialog } from "@/components/shared/PageDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useAuth } from "@/hooks/useAuth";
import { useCan } from "@/hooks/useCan";
import { formatPeso, responseError } from "@/lib/format";

const pesos = (cents: number) => cents / 100;
const faceLabel = (key: CashDenomination) => (key === "0.25" ? "₱0.25" : `₱${Number(key).toLocaleString("en-PH")}`);
const formatDay = (date: string) =>
  new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" });

function cents(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}

function CountDialog({
  row,
  date,
  token,
  onClose,
  onDone,
}: {
  row: CashCollectionRow;
  date: string;
  token: string | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const [counts, setCounts] = useState<Partial<Record<CashDenomination, string>>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed: DenominationCounts = useMemo(() => {
    const result: DenominationCounts = {};
    for (const key of CASH_DENOMINATIONS) {
      const value = Number(counts[key] || 0);
      if (value > 0) result[key] = value;
    }
    return result;
  }, [counts]);
  const countedCents = denominationTotalCents(parsed);
  const expectedCents = cents(row.expected);
  const difference = countedCents === null ? null : countedCents - expectedCents;
  const needsNote = difference !== null && difference !== 0;
  const canSubmit = countedCents !== null && (!needsNote || notes.trim().length > 0) && !busy;

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/cash-remittances", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ remitted_by: row.user_id, business_date: date, denominations: parsed, notes: notes.trim() || undefined }),
      });
      if (!res.ok) {
        toast.error(await responseError(res, "Could not confirm this cash"));
        await onDone();
        if (res.status === 409) onClose();
        return;
      }
      toast.success("Cash confirmed");
      await onDone();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not confirm this cash");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 px-4 py-4 md:px-6 md:py-6">
      <div>
        <h1 className="page-title">Count cash — {row.username}</h1>
        <p className="page-subtitle">{formatDay(date)} · expected {formatPeso(row.expected)} from {row.payment_count} cash {row.payment_count === 1 ? "payment" : "payments"}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CASH_DENOMINATIONS.map((key) => {
          const count = Number(counts[key] || 0);
          return (
            <label key={key} className="grid grid-cols-[5rem_1fr_6rem] items-center gap-2 text-sm">
              <span className="font-semibold text-foreground">{faceLabel(key)}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                aria-label={`Number of ${faceLabel(key)}`}
                value={counts[key] ?? ""}
                placeholder="0"
                onChange={(event) => setCounts((current) => ({ ...current, [key]: event.target.value }))}
              />
              <span className="text-right tabular-nums text-muted-foreground">
                {Number.isInteger(count) && count > 0 ? formatPeso(pesos(Math.round(parseFloat(key) * 100) * count)) : "—"}
              </span>
            </label>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
        <div className="flex justify-between"><span>Counted</span><strong>{countedCents === null ? "Check the counts" : formatPeso(pesos(countedCents))}</strong></div>
        <div className="flex justify-between"><span>Expected</span><strong>{formatPeso(row.expected)}</strong></div>
        <div className={`flex justify-between ${difference === 0 ? "text-success" : "text-destructive"}`}>
          <span>Difference</span>
          <strong>
            {difference === null ? "—" : difference === 0 ? "Matches" : `${difference > 0 ? "Over" : "Short"} ${formatPeso(pesos(Math.abs(difference)))}`}
          </strong>
        </div>
      </div>

      <label className="grid gap-1.5 text-sm font-semibold text-foreground">
        Notes{needsNote ? " (required: explain the difference)" : " (optional)"}
        <Textarea value={notes} rows={2} maxLength={500} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. ₱25 left with the customer as change" />
      </label>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="button" variant="success" onClick={() => void confirm()} disabled={!canSubmit}>
          <Banknote size={15} /> {busy ? "Saving…" : "Confirm cash received"}
        </Button>
      </div>
    </div>
  );
}

/** What gets printed: one block per confirmed hand-over, with the denomination breakdown and signature lines. */
function PrintSheet({ date, rows }: { date: string; rows: CashCollectionRow[] }) {
  const confirmed = rows.filter((row): row is CashCollectionRow & { remittance: CashRemittance } => row.remittance !== null);
  const expected = confirmed.reduce((sum, row) => sum + cents(row.remittance.expected_amount), 0);
  const counted = confirmed.reduce((sum, row) => sum + cents(row.remittance.counted_amount), 0);
  const pending = rows.filter((row) => !row.remittance);

  return (
    <div id="cash-print-area" className="hidden p-6 font-sans text-black print:block">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #cash-print-area, #cash-print-area * { visibility: visible; }
          html, body { height: auto !important; overflow: visible !important; }
          #cash-print-area { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>
      <h1 className="text-xl font-black uppercase">End-of-day cash reconciliation</h1>
      <p className="mb-4 text-sm">{formatDay(date)}</p>

      {confirmed.length === 0 ? (
        <p className="text-sm">No cash has been confirmed for this day.</p>
      ) : (
        confirmed.map((row) => (
          <section key={row.user_id} className="mb-5 break-inside-avoid border border-black p-3 text-xs">
            <div className="mb-2 flex justify-between text-sm font-bold">
              <span>{row.username} ({row.role})</span>
              <span>Received by {row.remittance.received_by_username ?? "—"}</span>
            </div>
            <table className="mb-2 w-full border-collapse">
              <thead>
                <tr className="border-b border-black text-left">
                  <th className="py-1">Denomination</th><th className="py-1 text-right">Count</th><th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {CASH_DENOMINATIONS.filter((key) => (row.remittance.denominations[key] ?? 0) > 0).map((key) => (
                  <tr key={key}>
                    <td className="py-0.5">{faceLabel(key)}</td>
                    <td className="py-0.5 text-right">{row.remittance.denominations[key]}</td>
                    <td className="py-0.5 text-right">{formatPeso(pesos(Math.round(parseFloat(key) * 100) * (row.remittance.denominations[key] ?? 0)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between border-t border-black pt-1">
              <span>Expected {formatPeso(row.remittance.expected_amount)}</span>
              <span>Counted <strong>{formatPeso(row.remittance.counted_amount)}</strong></span>
              <span>
                Difference {formatPeso(pesos(cents(row.remittance.counted_amount) - cents(row.remittance.expected_amount)))}
              </span>
            </div>
            {row.remittance.notes && <p className="mt-1">Note: {row.remittance.notes}</p>}
          </section>
        ))
      )}

      <div className="mt-2 flex justify-between border-t-2 border-black pt-2 text-sm font-bold">
        <span>Total expected {formatPeso(pesos(expected))}</span>
        <span>Total counted {formatPeso(pesos(counted))}</span>
        <span>Difference {formatPeso(pesos(counted - expected))}</span>
      </div>
      {pending.length > 0 && (
        <p className="mt-3 text-xs">Not yet confirmed: {pending.map((row) => `${row.username} (${formatPeso(row.expected)})`).join(", ")}</p>
      )}
      <div className="mt-10 flex justify-between text-xs">
        <span className="w-56 border-t border-black pt-1">Received by (signature over printed name)</span>
        <span className="w-56 border-t border-black pt-1">Checked by (signature over printed name)</span>
      </div>
    </div>
  );
}

export function CashReconciliation() {
  const { token } = useAuth();
  const canReconcile = useCan("cash:reconcile");
  const [date, setDate] = useState(todayInManila());
  const [rows, setRows] = useState<CashCollectionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counting, setCounting] = useState<CashCollectionRow | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/cash-remittances/collections?date=${encodeURIComponent(date)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await responseError(res, "Failed to load cash collections"));
      setRows(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cash collections");
    } finally {
      setIsLoading(false);
    }
  }, [token, date]);

  useEffect(() => {
    setIsLoading(true);
    void fetchData();
  }, [fetchData]);
  useAutoRefresh(fetchData, { enabled: Boolean(token) });

  const expectedTotal = rows.reduce((sum, row) => sum + cents(row.expected), 0);
  const countedTotal = rows.reduce((sum, row) => sum + (row.remittance ? cents(row.remittance.counted_amount) : 0), 0);
  const pendingCount = rows.filter((row) => !row.remittance).length;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">End-of-day cash</h1>
          <p className="page-subtitle">Count the cash drivers and agents hand in, and confirm it against what they recorded</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            Day
            <Input type="date" aria-label="Business day" value={date} max={todayInManila()} onChange={(event) => event.target.value && setDate(event.target.value)} />
          </label>
          <Button type="button" variant="outline" onClick={() => window.print()} disabled={rows.every((row) => !row.remittance)}>
            <Printer size={15} /> Print day sheet
          </Button>
        </div>
      </div>

      {error && (
        <Card className="no-print border-destructive/30 bg-destructive-soft p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      <div className="no-print grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4"><div className="text-2xl font-bold">{formatPeso(pesos(expectedTotal))}</div><p className="mt-1 text-xs font-semibold text-muted-foreground">Expected cash</p></Card>
        <Card className="p-4"><div className="text-2xl font-bold text-green">{formatPeso(pesos(countedTotal))}</div><p className="mt-1 text-xs font-semibold text-muted-foreground">Counted and confirmed</p></Card>
        <Card className="p-4"><div className={`text-2xl font-bold ${pendingCount > 0 ? "text-warning" : ""}`}>{pendingCount}</div><p className="mt-1 text-xs font-semibold text-muted-foreground">Still to confirm</p></Card>
        <Card className="p-4"><div className="text-2xl font-bold">{rows.length}</div><p className="mt-1 text-xs font-semibold text-muted-foreground">Collectors</p></Card>
      </div>

      <Card className="no-print overflow-hidden rounded-xl shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Collector</TableHead>
              <TableHead className="text-right">Cash payments</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Counted</TableHead>
              <TableHead className="text-right">Difference</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Received by</TableHead>
              {canReconcile && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canReconcile ? 8 : 7} className="py-10 text-center text-sm text-muted-foreground">
                  No cash was recorded on deliveries on {formatDay(date)}.
                </TableCell>
              </TableRow>
            ) : rows.map((row) => {
              const difference = row.remittance ? cents(row.remittance.counted_amount) - cents(row.expected) : null;
              return (
                <TableRow key={row.user_id}>
                  <TableCell className="text-sm font-semibold text-foreground">{row.username} <span className="text-xs font-normal capitalize text-muted-foreground">{row.role}</span></TableCell>
                  <TableCell className="text-right text-sm">{row.payment_count}</TableCell>
                  <TableCell className="text-right text-sm font-bold">{formatPeso(row.expected)}</TableCell>
                  <TableCell className="text-right text-sm">{row.remittance ? formatPeso(row.remittance.counted_amount) : "—"}</TableCell>
                  <TableCell className={`text-right text-sm font-semibold ${difference === null || difference === 0 ? "" : "text-destructive"}`}>
                    {difference === null ? "—" : difference === 0 ? "Matches" : `${difference > 0 ? "+" : "−"}${formatPeso(pesos(Math.abs(difference)))}`}
                  </TableCell>
                  <TableCell><StatusBadge label={row.remittance ? "Confirmed" : "Waiting"} tone={row.remittance ? "success" : "warning"} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.remittance?.received_by_username ?? "—"}</TableCell>
                  {canReconcile && (
                    <TableCell className="text-right">
                      {!row.remittance && (
                        <Button type="button" variant="success" size="sm" onClick={() => setCounting(row)}>
                          <Banknote size={13} /> Count cash
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* A portal to <body>, so the app shell's scroll containers cannot clip the printout to one page. */}
      {createPortal(<PrintSheet date={date} rows={rows} />, document.body)}

      {counting && (
        <PageDialog onClose={() => setCounting(null)} label="Count cash">
          <CountDialog row={counting} date={date} token={token} onClose={() => setCounting(null)} onDone={fetchData} />
        </PageDialog>
      )}
    </div>
  );
}
