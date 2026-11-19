import { Button } from "@/components/ui/button";
import { PageDialog } from "@/components/shared/PageDialog";
import { StatCard } from "@/components/shared/StatCard";
import { Package, CalendarDays, Store, CircleCheck } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { ArrowLeft } from "lucide-react";
import { RecordTitleButton } from "@/components/RecordTitleButton";
import { TableFilterSelect, TableToolbar } from "@/components/TableToolbar";
import { TablePagination, paginate } from "@/components/TablePagination";
import { Customer, Truck, Invoice } from "@shared/api";
import { Table } from "@/components/ui/table";
import { SortableHeader, SortState, compareValues } from "@/components/SortableHeader";

interface Receipt {
  id: string;
  receipt_number: string;
  customer_id: string;
  truck_id: string;
  invoice_id: string;
  confirmed_at: string;
  notes?: string;
  confirmed_by?: string;
}

export interface ReceiptExt extends Receipt {
  customer?: Pick<Customer, "store_name" | "location" | "contact_info">;
  truck?: Pick<Truck, "license_plate">;
  invoice?: Pick<Invoice, "payment_status">;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function DeliveryHistory() {
  const { token } = useAuth();

  const [receipts,  setReceipts]  = useState<ReceiptExt[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [trucks,    setTrucks]    = useState<Truck[]>([]);
  const [invoices,  setInvoices]  = useState<Invoice[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const [search,       setSearch]       = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [dateFilter,   setDateFilter]   = useState("");
  const [page,         setPage]         = useState(1);
  const [viewReceipt,  setViewReceipt]  = useState<ReceiptExt | null>(null);
  const [sort, setSort] = useState<SortState<"receipt" | "customer" | "truck" | "confirmed" | "notes">>(null);

  const fetchAll = useCallback(async () => {
    if (!token) return;
    try {
      const [rRes, cRes, tRes, iRes] = await Promise.all([
        fetch("/api/receipts",  { headers: authHeaders(token) }),
        fetch("/api/customers", { headers: authHeaders(token) }),
        fetch("/api/trucks",    { headers: authHeaders(token) }),
        fetch("/api/invoices",  { headers: authHeaders(token) }),
      ]);

      const [receiptsData, customersData, trucksData, invoicesData] = await Promise.all([
        rRes.ok ? rRes.json() : [],
        cRes.ok ? cRes.json() : [],
        tRes.ok ? tRes.json() : [],
        iRes.ok ? iRes.json() : [],
      ]);

      setCustomers(customersData);
      setTrucks(trucksData);
      setInvoices(invoicesData);

      const joined: ReceiptExt[] = (receiptsData as Receipt[]).map((r) => ({
        ...r,
        customer: (customersData as Customer[]).find((c) => c.id === r.customer_id),
        truck:    (trucksData    as Truck[]).find((t)   => t.id === r.truck_id),
        invoice:  (invoicesData  as Invoice[]).find((i) => i.id === r.invoice_id),
      }));

      setReceipts(joined);
      setError(null);
    } catch {
      setError("Failed to load delivery history.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useAutoRefresh(fetchAll, { enabled: Boolean(token) });

  const filtered = receipts.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch =
      r.receipt_number.toLowerCase().includes(q) ||
      (r.customer?.store_name ?? "").toLowerCase().includes(q) ||
      (r.truck?.license_plate ?? "").toLowerCase().includes(q) ||
      r.invoice_id.toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (customerFilter && customerFilter !== "all" && r.customer_id !== customerFilter) return false;
    if (dateFilter && new Date(r.confirmed_at).toLocaleDateString("en-CA") !== dateFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (!sort) return (Date.parse(b.confirmed_at) || 0) - (Date.parse(a.confirmed_at) || 0);
    const value = (receipt: ReceiptExt) => ({ receipt: receipt.receipt_number, customer: receipt.customer?.store_name, truck: receipt.truck?.license_plate, confirmed: receipt.confirmed_at, notes: receipt.notes })[sort.key];
    return compareValues(value(a), value(b)) * (sort.direction === "asc" ? 1 : -1);
  });
  const { currentPage, totalPages, pageItems: paginated } = paginate(sorted, page);



  const totalReceipts = receipts.length;
  const todayReceipts = receipts.filter((r) => {
    const today = new Date().toDateString();
    return new Date(r.confirmed_at).toDateString() === today;
  }).length;

  return (
    <>

    <div className="flex-1 px-4 md:px-6 lg:px-7 py-4 md:py-6 overflow-y-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title">
            Delivery History
          </h1>
          <p className="page-subtitle">
            Completed deliveries and their original receipts
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red/30 bg-red/10 px-4 py-2 text-xs text-red">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Deliveries" value={totalReceipts.toString()} icon={Package} />
        <StatCard label="Today"             value={todayReceipts.toString()} icon={CalendarDays} />
        <StatCard label="Unique customers" value={new Set(receipts.map((r) => r.customer_id)).size.toString()} icon={Store} />
        <StatCard label="Paid in full" value={receipts.filter((r) => r.invoice?.payment_status === "paid").length.toString()} icon={CircleCheck} detail={`of ${receipts.length} delivered`} />
      </div>

      {/* Search and Filters */}
      <TableToolbar
        searchValue={search}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder="Search by receipt #, customer, truck, or invoice…"
      >
        <TableFilterSelect label="Customer" value={customerFilter} onChange={(value) => { setCustomerFilter(value); setPage(1); }}>
          <option value="">All Customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.store_name || c.id.slice(0, 8)}</option>
          ))}
        </TableFilterSelect>
        <input type="date" aria-label="Confirmed on date" title="Show deliveries confirmed on this date" value={dateFilter} onChange={(event) => { setDateFilter(event.target.value); setPage(1); }} className="rounded-full border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-accent-2 focus:outline-none" />
      </TableToolbar>

      {/* Table */}
      <div className="data-table-frame overflow-hidden">
        {loading ? (
          <p className="px-6 py-8 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <SortableHeader label="Receipt #" sortKey="receipt" sort={sort} onSort={setSort} />
                  <SortableHeader label="Customer" sortKey="customer" sort={sort} onSort={setSort} />
                  <SortableHeader label="Truck" sortKey="truck" sort={sort} onSort={setSort} />
                  <SortableHeader label="Confirmed At" sortKey="confirmed" sort={sort} onSort={setSort} />
                  <SortableHeader label="Notes" sortKey="notes" sort={sort} onSort={setSort} />
                  <th className="bg-muted px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                      {receipts.length === 0 ? "No completed deliveries yet." : "No results matching your search."}
                    </td>
                  </tr>
                ) : (
                  paginated.map((r) => (
                    <tr key={r.id} className="border-b border-border hover:bg-accent/50 transition-colors">
                      <td className="px-3 py-3 font-mono font-semibold">
                        <RecordTitleButton onClick={() => setViewReceipt(r)}>{r.receipt_number}</RecordTitleButton>
                      </td>
                      <td className="px-3 py-3 text-foreground font-semibold">
                        {r.customer?.store_name ?? <span className="text-muted-foreground font-normal">{r.customer_id.slice(0, 8)}…</span>}
                        {r.customer?.location && <p className="text-muted-foreground font-normal text-xs">{r.customer.location}</p>}
                      </td>
                      <td className="px-3 py-3 text-foreground">
                        {r.truck?.license_plate ?? <span className="text-muted-foreground">{r.truck_id.slice(0, 8)}…</span>}
                      </td>
                      <td className="px-3 py-3 text-foreground whitespace-nowrap">
                        {new Date(r.confirmed_at).toLocaleString("en-PH")}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{r.notes ?? "—"}</td>
                      <td className="px-3 py-3">
                        <Button
                          onClick={() => setViewReceipt(r)}
                          variant="outline" size="sm"
                        >
                          View OR
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
        )}

        <TablePagination page={currentPage} totalPages={totalPages} totalItems={filtered.length} onPageChange={setPage} />
      </div>

    </div>
  
      {(viewReceipt) && (
        <PageDialog onClose={() => setViewReceipt(null)}>
<div className="mx-auto w-full !max-w-xl">
<OriginalReceiptModal receipt={viewReceipt} onClose={() => setViewReceipt(null)} showBack={false} />
</div>
        </PageDialog>
      )}
    </>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────


// ─── Original Receipt Modal ───────────────────────────────────────────────────

export function OriginalReceiptModal({ receipt, onClose, showBack = true }: { receipt: ReceiptExt; onClose: () => void; showBack?: boolean }) {
  const handlePrint = () => window.print();

  return (
    <div className="flex-1 flex flex-col gap-6 p-6">
      <style>{`
        #original-receipt-print-area { background: #fff; color: #111; }
        #original-receipt-print-area .text-muted-foreground { color: #52525b !important; }
        @media print {
          @page { size: auto; margin: 0.35in; }
          html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          body:has(#original-receipt-print-area) [data-radix-dialog-overlay] { display: none !important; }
          body:has(#original-receipt-print-area) [data-radix-dialog-content] {
            position: static !important; display: block !important; width: auto !important; max-width: none !important;
            max-height: none !important; overflow: visible !important; transform: none !important; border: 0 !important;
            padding: 0 !important; box-shadow: none !important; background: transparent !important;
          }
          #original-receipt-print-area, #original-receipt-print-area * { visibility: visible !important; }
          #original-receipt-print-area {
            position: relative !important; width: 100% !important; max-width: 7.5in; margin: 0 auto !important;
            padding: 0.2in !important; background: #fff !important; color: #111 !important; break-inside: avoid;
          }
          #original-receipt-print-area .text-muted-foreground { color: #52525b !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Original Receipt</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={handlePrint} variant="outline">
            Print
          </Button>
          {showBack && (
            <Button onClick={onClose} variant="outline">
              <ArrowLeft size={15} />
              Back
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-lg w-full rounded-2xl border border-border bg-white text-black">
        <div className="p-6 sm:p-8 space-y-6 font-mono text-sm" id="original-receipt-print-area">
          {/* Company header */}
          <div className="text-center border-b-2 border-dashed border-border pb-4">
            <p className="font-rajdhani text-2xl font-bold text-foreground tracking-tight">COLDCHAIN CONNECT</p>
            <p className="page-subtitle">ACDP Warehouse, Pampanga</p>
            <p className="text-xs text-muted-foreground">Cold Chain Logistics & Distribution</p>
          </div>

          {/* Receipt info */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Receipt No.:</span>
              <span className="font-bold text-accent-2">{receipt.receipt_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date:</span>
              <span>{new Date(receipt.confirmed_at).toLocaleString("en-PH")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice ID:</span>
              <span>{receipt.invoice_id.slice(0, 8)}…</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Truck:</span>
              <span>{receipt.truck?.license_plate ?? receipt.truck_id.slice(0, 8)}</span>
            </div>
            {receipt.confirmed_by && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Confirmed by:</span>
                <span>{receipt.confirmed_by}</span>
              </div>
            )}
          </div>

          {/* Customer info */}
          <div className="border-t border-dashed border-border pt-4 space-y-1 text-xs">
            <p className="font-semibold text-foreground mb-1">Delivered to:</p>
            <p className="font-bold">{receipt.customer?.store_name ?? receipt.customer_id}</p>
            {receipt.customer?.location && <p className="text-muted-foreground">{receipt.customer.location}</p>}
            {receipt.customer?.contact_info && <p className="text-muted-foreground">{receipt.customer.contact_info}</p>}
          </div>

          {/* Invoice status */}
          <div className="border-t border-dashed border-border pt-4 space-y-1 text-xs">
            {receipt.invoice?.payment_status && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Status:</span>
                <span>{receipt.invoice.payment_status.toUpperCase()}</span>
              </div>
            )}
          </div>

          {/* Notes */}
          {receipt.notes && (
            <div className="border-t border-dashed border-border pt-4 text-xs">
              <p className="text-muted-foreground">Notes:</p>
              <p>{receipt.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t-2 border-dashed border-border pt-4 text-center text-xs text-muted-foreground space-y-1">
            <p>This is an official Original Receipt.</p>
            <p>Thank you for your business!</p>
            <p className="mt-2 font-semibold text-foreground">ColdChain Connect</p>
          </div>
        </div>
      </div>
    </div>
  );
}
