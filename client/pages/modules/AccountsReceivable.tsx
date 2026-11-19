import { toast } from "sonner";
import { confirmAction } from "@/lib/confirm";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { StatusBadge, StatusTone } from "@/components/StatusBadge";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle } from "lucide-react";
import { TableBulkAction, TableToolbar } from "@/components/TableToolbar";
import { newestFirst } from "@/components/SortableHeader";
import { AccountsReceivable as ARType, Customer } from "@shared/api";
import { useAuth } from "../../hooks/useAuth";

type Tab = "outstanding" | "paid" | "credits" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "outstanding", label: "Outstanding" },
  { key: "paid",        label: "Paid" },
  { key: "credits",     label: "Credits" },
  { key: "all",         label: "All" },
];

const PER_PAGE = 15;

export function AccountsReceivable() {
  const [arRecords, setARRecords] = useState<ARType[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("outstanding");
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fromDateTime, setFromDateTime] = useState("");
  const [toDateTime, setToDateTime] = useState("");
  const [page, setPage] = useState(1);

  const fetchData = async () => {
    if (!token) return;
    try {
      const [arRes, custRes] = await Promise.all([
        fetch("/api/accounts-receivable", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/customers", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!arRes.ok) throw new Error("Failed to fetch AR records");
      const arData = await arRes.json();
      setARRecords(arData);

      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomers(custData);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading data");
      setARRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    if (!(await confirmAction("Mark this AR record as paid?"))) return;
    setMarkingPaid(id);
    try {
      const res = await fetch(`/api/accounts-receivable/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "paid" }),
      });
      if (!res.ok) throw new Error(await res.text());
      // Switch to Paid tab so user can immediately see the record
      setActiveTab("paid");
      await fetchData();
    } catch (err) {
      toast.error("Failed to mark as paid: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setMarkingPaid(null);
    }
  };

  const handleMarkSelectedPaid = async () => {
    const eligible = arRecords.filter((ar) => selectedIds.includes(ar.id) && ar.status !== "paid" && parseFloat(ar.amount_due) >= 0);
    if (eligible.length === 0) return void toast.error("Select unpaid records to mark as paid");
    if (!(await confirmAction(`Mark ${eligible.length} selected AR ${eligible.length === 1 ? "record" : "records"} as paid?`))) return;

    const results = await Promise.all(eligible.map(async (ar) => {
      try {
        const res = await fetch(`/api/accounts-receivable/${ar.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: "paid" }),
        });
        return res.ok;
      } catch {
        return false;
      }
    }));
    const failed = results.filter((ok) => !ok).length;
    setSelectedIds([]);
    await fetchData();
    if (failed > 0) toast.error(`${failed} record(s) could not be marked as paid.`);
  };

  useEffect(() => {
    if (token) fetchData();
  }, [token]);
  useAutoRefresh(fetchData, { enabled: Boolean(token) });

  const getCustomerName = (customerId: string) =>
    customers.find((c) => c.id === customerId)?.store_name || customerId.slice(0, 8);

  const daysCreated = (createdAt: string) => {
    const days = Math.floor(
      (new Date().getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    return days;
  };

  const getAgeColor = (days: number) => {
    if (days <= 7)  return "bg-success-soft text-success";
    if (days <= 30) return "bg-warning-soft text-warning";
    if (days <= 60) return "bg-warning-soft text-warning";
    return "bg-destructive-soft text-destructive";
  };

  const getStatusTone = (status: string): StatusTone => {
    if (status === "paid")    return "success";
    if (status === "partial") return "info";
    return "warning";
  };

  // ── Derived counts ──────────────────────────────────────────────────────────
  const outstandingRecords = arRecords.filter(
    (ar) => ar.status === "outstanding" && parseFloat(ar.amount_due) >= 0
  );
  const paidRecords = arRecords.filter((ar) => ar.status === "paid");
  const creditRecords = arRecords.filter((ar) => parseFloat(ar.amount_due) < 0);

  const tabCounts: Record<Tab, number> = {
    outstanding: outstandingRecords.length,
    paid:        paidRecords.length,
    credits:     creditRecords.length,
    all:         arRecords.length,
  };

  const totalOutstanding = outstandingRecords.reduce(
    (sum, ar) => sum + parseFloat(ar.amount_due || "0"), 0
  );

  // ── Filter by active tab + search ───────────────────────────────────────────
  const tabFiltered = arRecords.filter((ar) => {
    const amountNum = parseFloat(ar.amount_due);
    if (activeTab === "outstanding") return ar.status === "outstanding" && amountNum >= 0;
    if (activeTab === "paid")        return ar.status === "paid";
    if (activeTab === "credits")     return amountNum < 0;
    return true; // "all"
  });

  const filtered = newestFirst(tabFiltered.filter((ar) => {
    const q = searchTerm.toLowerCase();
    const createdAt = new Date(ar.created_at).getTime();
    if (fromDateTime && createdAt < new Date(fromDateTime).getTime()) return false;
    if (toDateTime && createdAt > new Date(toDateTime).getTime()) return false;
    return (
      ar.id.toLowerCase().includes(q) ||
      getCustomerName(ar.customer_id).toLowerCase().includes(q)
    );
  }));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  const pageIds = paginated.map((ar) => ar.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const selectedRecords = arRecords.filter((ar) => selectedIds.includes(ar.id));
  const toggleRecordSelection = (id: string, checked: boolean) =>
    setSelectedIds((current) => (checked ? [...current, id] : current.filter((selectedId) => selectedId !== id)));
  const togglePageSelection = (checked: boolean) =>
    setSelectedIds((current) => (checked ? Array.from(new Set([...current, ...pageIds])) : current.filter((id) => !pageIds.includes(id))));
  const bulkActions: TableBulkAction[] = [
    { label: "Mark selected as paid", onSelect: () => void handleMarkSelectedPaid() },
  ];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="flex-1 flex flex-col p-6 gap-6">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title">Accounts Receivable</h1>
          <p className="page-subtitle">Track customer balances and unpaid deliveries</p>
        </div>
      </div>

      {error && (
        <Card className="p-4 bg-destructive-soft border-destructive/30">
          <p className="text-destructive text-sm">{error}</p>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold text-foreground">{outstandingRecords.length}</div>
          <p className="text-xs text-muted-foreground font-semibold tracking-tight mt-1">Outstanding</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-green">{paidRecords.length}</div>
          <p className="text-xs text-muted-foreground font-semibold tracking-tight mt-1">Paid</p>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-accent-2">{creditRecords.length}</div>
          <p className="text-xs text-muted-foreground font-semibold tracking-tight mt-1">Credits</p>
        </Card>
        <Card className="p-4 bg-info-soft">
          <div className="text-xs text-muted-foreground mb-1">Total Outstanding</div>
          <div className="text-xl font-bold text-foreground">₱{totalOutstanding.toFixed(2)}</div>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <div className="inline-flex w-fit rounded-full border border-border bg-card p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearchTerm(""); setSelectedIds([]); setPage(1); }}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                activeTab === tab.key ? "bg-card/20 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {tabCounts[tab.key]}
              </span>
            </button>
          ))}
        </div>
        <TableToolbar
          selectedCount={selectedRecords.length}
          bulkActions={bulkActions}
          searchValue={searchTerm}
          onSearchChange={(value) => { setSearchTerm(value); setPage(1); }}
          searchPlaceholder="Search by customer or AR ID…"
        >
          <input type="datetime-local" aria-label="Created from date and time" title="Show records created from this date and time" value={fromDateTime} max={toDateTime || undefined} onChange={(event) => { setFromDateTime(event.target.value); setPage(1); }} className="rounded-full border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-accent-2 focus:outline-none" />
          <input type="datetime-local" aria-label="Created to date and time" title="Show records created up to this date and time" value={toDateTime} min={fromDateTime || undefined} onChange={(event) => { setToDateTime(event.target.value); setPage(1); }} className="rounded-full border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-accent-2 focus:outline-none" />
        </TableToolbar>
      </div>

      {/* Table */}
      <Card className="overflow-hidden rounded-xl shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 px-3">
                <input aria-label="Select all AR records on this page" type="checkbox" checked={allPageSelected} onChange={(event) => togglePageSelection(event.target.checked)} />
              </TableHead>
              <TableHead>AR ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Created</TableHead>
              {activeTab !== "paid" && <TableHead>Age</TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                  {activeTab === "outstanding" && "No outstanding balances — great job! 🎉"}
                  {activeTab === "paid"        && "No paid records yet."}
                  {activeTab === "credits"     && "No return credits yet."}
                  {activeTab === "all"         && (arRecords.length === 0 ? "No AR records yet." : "No records match your search.")}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((ar) => {
                const days = daysCreated(ar.created_at);
                const amountNum = parseFloat(ar.amount_due);
                const isCredit = amountNum < 0;
                return (
                  <TableRow key={ar.id} className="hover:bg-accent/40 transition-colors">
                    <TableCell className="w-10 px-3">
                      <input aria-label={`Select AR ${ar.id.slice(0, 8)}`} type="checkbox" checked={selectedIds.includes(ar.id)} onChange={(event) => toggleRecordSelection(ar.id, event.target.checked)} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{ar.id.slice(0, 8)}…</TableCell>
                    <TableCell className="text-sm font-semibold text-foreground">
                      {getCustomerName(ar.customer_id)}
                    </TableCell>
                    <TableCell className={`text-sm font-bold ${isCredit ? "text-success" : ""}`}>
                      {isCredit
                        ? <span>−₱{Math.abs(amountNum).toFixed(2)} <span className="text-xs font-normal text-success">(credit)</span></span>
                        : `₱${amountNum.toFixed(2)}`
                      }
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={ar.status} tone={getStatusTone(ar.status)} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={ar.notes ?? ""}>
                      {ar.notes || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(ar.created_at).toLocaleDateString("en-PH")}
                    </TableCell>
                    {activeTab !== "paid" && (
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getAgeColor(days)}`}>
                          {days}d
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      {ar.status !== "paid" && !isCredit ? (
                        <button
                          onClick={() => handleMarkPaid(ar.id)}
                          disabled={markingPaid === ar.id}
                          className="flex items-center gap-1.5 ml-auto whitespace-nowrap px-3 py-1.5 bg-green text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                          <CheckCircle size={13} />
                          {markingPaid === ar.id ? "Saving…" : "Mark Paid"}
                        </button>
                      ) : ar.status === "paid" ? (
                        <span className="text-xs text-green font-semibold">Paid</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/50">
            <span className="text-xs text-muted-foreground">
              {(currentPage - 1) * PER_PAGE + 1}–{Math.min(currentPage * PER_PAGE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-border rounded text-xs font-semibold disabled:opacity-40 hover:bg-card"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-xs font-semibold text-foreground">{currentPage} / {totalPages}</span>
              <button
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-border rounded text-xs font-semibold disabled:opacity-40 hover:bg-card"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
