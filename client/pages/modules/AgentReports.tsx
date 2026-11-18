import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../hooks/useAuth";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { StatusBadge, StatusTone } from "@/components/StatusBadge";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { ArrowLeft, RotateCcw, CheckCircle, XCircle } from "lucide-react";
import { AgentReturn, Invoice, Customer, Product } from "@shared/api";
import { LogReturnForm } from "./LogReturnForm";
import { Table } from "@/components/ui/table";
import { newestFirst } from "@/components/SortableHeader";
import { TableBulkAction, TableToolbar } from "@/components/TableToolbar";
import { confirmAction } from "@/lib/confirm";

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

function returnStatusTone(status: string): StatusTone {
  if (status === "accepted") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

function returnTypeBadge(type: string) {
  return type === "damaged"
    ? "bg-warning-soft text-warning"
    : "bg-info-soft text-link";
}

// ─── Agent: full-screen Log Return ────────────────────────────────────────────
function AgentLogReturnScreen({
  invoices, customers, products, token,
}: {
  invoices: Invoice[]; customers: Customer[]; products: Product[]; token: string;
}) {
  const [logged, setLogged] = useState(false);

  return (
    <div className="px-4 md:px-6 lg:px-7 py-4 md:py-6 space-y-5 max-w-xl mx-auto">
      <div>
        <h1 className="page-title">Logging Returns</h1>
        <p className="page-subtitle">Record returned items and their condition</p>
      </div>

      {logged && (
        <div className="rounded-lg border border-green/30 bg-green/10 px-4 py-2 text-xs text-green">
          Return logged.
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border flex flex-col">
        <LogReturnForm
          invoices={invoices}
          customers={customers}
          products={products}
          token={token}
          onSaved={() => setLogged(true)}
          onCancel={() => setLogged(false)}
        />
      </div>
    </div>
  );
}

// ─── Admin: Create Return Modal ───────────────────────────────────────────────
function CreateReturnModal({
  invoices, customers, products, token, onClose, onCreated,
}: {
  invoices: Invoice[]; customers: Customer[]; products: Product[];
  token: string; onClose: () => void; onCreated: () => void;
}) {
  return (
    <div className="px-4 md:px-6 lg:px-7 py-4 md:py-6 space-y-5 max-w-xl mx-auto">
      <div className="page-header">
        <div>
          <h1 className="page-title">Log Return</h1>
        </div>
        <button onClick={onClose} className="btn-ghost">
          <ArrowLeft size={15} />
          Back
        </button>
      </div>
      <div className="bg-card rounded-2xl border border-border flex flex-col">
        <LogReturnForm
          invoices={invoices}
          customers={customers}
          products={products}
          token={token}
          onSaved={() => { onCreated(); onClose(); }}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

// ─── Main Returns Component ───────────────────────────────────────────────────
export function AgentReports() {
  const { token, user } = useAuth();
  const role = user?.role;
  const isAgent = role === "agent";

  const [returns,   setReturns]   = useState<AgentReturn[]>([]);
  const [invoices,  setInvoices]  = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products,  setProducts]  = useState<Product[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "accepted" | "rejected">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchAll = useCallback(async () => {
    if (!token) return;
    try {
      const [rRes, iRes, cRes, pRes] = await Promise.all([
        fetch("/api/agent-returns",  { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/invoices",       { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/customers",      { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/products",       { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [returnsData, invoicesData, customersData, productsData] = await Promise.all([
        rRes.ok ? rRes.json() : [],
        iRes.ok ? iRes.json() : [],
        cRes.ok ? cRes.json() : [],
        pRes.ok ? pRes.json() : [],
      ]);
      setReturns(returnsData);
      setInvoices(invoicesData);
      setCustomers(customersData);
      setProducts(productsData);
      setError(null);
    } catch {
      setError("Failed to load returns.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useAutoRefresh(fetchAll, { enabled: Boolean(token) });

  const handleAccept = async (id: string) => {
    if (!token) return;
    setProcessing(id);
    try {
      const res = await fetch(`/api/agent-returns/${id}/accept`, {
        method: "POST", headers: authHeaders(token),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
    } catch (err) {
      toast.error("Failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt("Reason for rejection (optional):");
    if (reason === null) return;
    if (!token) return;
    setProcessing(id);
    try {
      const res = await fetch(`/api/agent-returns/${id}/reject`, {
        method: "POST", headers: authHeaders(token),
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
    } catch (err) {
      toast.error("Failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setProcessing(null);
    }
  };

  const processSelected = async (action: "accept" | "reject") => {
    if (!token) return;
    const pending = returns.filter((ret) => selectedIds.includes(ret.id) && ret.status === "pending");
    if (pending.length === 0) return void toast.error("Select pending returns to review");

    let reason = "";
    if (action === "reject") {
      const input = prompt("Reason for rejection (optional):");
      if (input === null) return;
      reason = input;
    } else if (!(await confirmAction(`Accept ${pending.length} selected ${pending.length === 1 ? "return" : "returns"}?`))) {
      return;
    }

    const results = await Promise.all(pending.map(async (ret) => {
      try {
        const res = await fetch(`/api/agent-returns/${ret.id}/${action}`, {
          method: "POST",
          headers: authHeaders(token),
          ...(action === "reject" && { body: JSON.stringify({ reason }) }),
        });
        return res.ok;
      } catch {
        return false;
      }
    }));
    const failed = results.filter((ok) => !ok).length;
    setSelectedIds([]);
    await fetchAll();
    if (failed > 0) toast.error(`${failed} return(s) could not be ${action === "accept" ? "accepted" : "rejected"}.`);
  };

  if (isAgent) {
    return (
      <AgentLogReturnScreen
        invoices={invoices}
        customers={customers}
        products={products}
        token={token!}
      />
    );
  }

  if (showCreate) {
    return (
      <CreateReturnModal
        invoices={invoices}
        customers={customers}
        products={products}
        token={token!}
        onClose={() => setShowCreate(false)}
        onCreated={fetchAll}
      />
    );
  }

  const filtered = newestFirst(returns.filter((ret) => {
    const invoice = invoices.find((entry) => entry.id === ret.invoice_id);
    const customer = customers.find((entry) => entry.id === ret.customer_id);
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query || [ret.id, invoice?.receipt_number, ret.customer_id, customer?.store_name, ret.product_name, ret.reason]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesSearch && (statusFilter === "all" || ret.status === statusFilter);
  }));

  const pendingCount  = returns.filter((r) => r.status === "pending").length;
  const acceptedCount = returns.filter((r) => r.status === "accepted").length;
  const rejectedCount = returns.filter((r) => r.status === "rejected").length;

  const filteredIds = filtered.map((ret) => ret.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
  const selectedReturns = returns.filter((ret) => selectedIds.includes(ret.id));
  const toggleReturnSelection = (id: string, checked: boolean) =>
    setSelectedIds((current) => (checked ? [...current, id] : current.filter((selectedId) => selectedId !== id)));
  const toggleFilteredSelection = (checked: boolean) =>
    setSelectedIds((current) => (checked ? Array.from(new Set([...current, ...filteredIds])) : current.filter((id) => !filteredIds.includes(id))));
  const bulkActions: TableBulkAction[] = [
    { label: "Accept selected returns", onSelect: () => void processSelected("accept") },
    { label: "Reject selected returns", onSelect: () => void processSelected("reject"), destructive: true },
  ];

  return (
    <div className="flex-1 px-4 md:px-6 lg:px-7 py-4 md:py-6 overflow-y-auto space-y-6">

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title">Returns</h1>
          <p className="page-subtitle">Manage returned goods — restock or write off</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)}
            className="px-3 py-2 bg-accent-2 text-white rounded-lg font-semibold text-sm hover:opacity-90 flex items-center gap-2">
            <RotateCcw size={15} /> Log Return
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red/30 bg-red/10 px-4 py-2 text-xs text-red">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-2xl font-bold text-warning">{pendingCount}</div>
          <div className="text-xs text-muted-foreground font-semibold tracking-tight mt-1">Pending Review</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-2xl font-bold text-green">{acceptedCount}</div>
          <div className="text-xs text-muted-foreground font-semibold tracking-tight mt-1">Accepted</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-2xl font-bold text-red">{rejectedCount}</div>
          <div className="text-xs text-muted-foreground font-semibold tracking-tight mt-1">Rejected</div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="inline-flex w-fit rounded-full border border-border bg-card p-1">
          {(["all", "pending", "accepted", "rejected"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
                statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {s}
            </button>
          ))}
        </div>
        <TableToolbar
          selectedCount={selectedReturns.length}
          bulkActions={bulkActions}
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search order, customer, product…"
        />
      </div>

      <div className="data-table-frame overflow-hidden">
        {loading ? (
          <LoadingSpinner className="min-h-32" />
        ) : (
          <div className="overflow-x-auto">
            <Table className="w-full text-xs md:text-sm">
              <thead>
                <tr>
                  <th className="w-10 bg-navy-mid px-3 py-3 text-left border-b border-border">
                    <input aria-label="Select all returns" type="checkbox" checked={allFilteredSelected} onChange={(event) => toggleFilteredSelection(event.target.checked)} />
                  </th>
                  {["Date", "Order", "Customer", "Product", "Qty", "Type", "Reason", "Status", "Actions"].map((h) => (
                    <th key={h} className="bg-navy-mid text-muted-foreground font-barlow-cond text-xs font-bold px-3 py-3 text-left border-b border-border whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-8 text-center text-muted-foreground">
                      {returns.length === 0 ? "No returns logged yet." : "No records match this filter."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((ret) => {
                    const inv = invoices.find((i) => i.id === ret.invoice_id);
                    const cust = customers.find((c) => c.id === ret.customer_id);
                    return (
                      <tr key={ret.id} className="border-b border-border hover:bg-accent/40 transition-colors">
                        <td className="w-10 px-3 py-3">
                          <input aria-label={`Select return ${ret.id.slice(0, 8)}`} type="checkbox" checked={selectedIds.includes(ret.id)} onChange={(event) => toggleReturnSelection(ret.id, event.target.checked)} />
                        </td>
                        <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                          {new Date(ret.created_at).toLocaleDateString("en-PH")}
                        </td>
                        <td className="px-3 py-3 font-mono text-foreground">
                          {inv?.receipt_number || ret.invoice_id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-3 py-3 text-foreground font-semibold">
                          {cust?.store_name || ret.customer_id.slice(0, 8)}
                          {cust?.contact_person && (
                            <p className="text-xs text-muted-foreground font-normal">{cust.contact_person}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-foreground">{ret.product_name}</td>
                        <td className="px-3 py-3 font-semibold text-foreground">{ret.qty_returned}</td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${returnTypeBadge(ret.return_type)}`}>
                            {ret.return_type === "damaged" ? "Damaged" : "Good"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground max-w-[160px] truncate" title={ret.reason ?? ""}>
                          {ret.reason || "—"}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge label={ret.status} tone={returnStatusTone(ret.status)} />
                          {ret.status === "accepted" && ret.return_type === "good" && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {ret.restored_to_pallet_id ? "Restocked ✓" : "Written off"}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {ret.status === "pending" ? (
                            <div className="flex gap-1">
                              <button
                                disabled={processing === ret.id}
                                onClick={() => handleAccept(ret.id)}
                                className="flex items-center gap-1 px-2 py-1 bg-green text-white text-xs font-semibold rounded hover:opacity-90 disabled:opacity-50"
                              >
                                <CheckCircle size={12} /> Accept
                              </button>
                              <button
                                disabled={processing === ret.id}
                                onClick={() => handleReject(ret.id)}
                                className="flex items-center gap-1 px-2 py-1 border border-red text-red text-xs font-semibold rounded hover:bg-red/10 disabled:opacity-50"
                              >
                                <XCircle size={12} /> Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {ret.reviewed_at ? new Date(ret.reviewed_at).toLocaleDateString("en-PH") : "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </div>
        )}
      </div>

    </div>
  );
}
