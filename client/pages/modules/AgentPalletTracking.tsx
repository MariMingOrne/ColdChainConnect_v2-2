import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/lib/confirm";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { ArrowLeft, ChevronDown, ChevronUp, Package, Search } from "lucide-react";
import { Booking, InventoryBatch, Pallet, Product } from "@shared/api";
import { useAuth } from "../../hooks/useAuth";
import { Input } from "@/components/ui/input";
import { batchSummary, groupPalletItemsByProduct } from "@/components/pallets/palletUtils";
import { PalletBatchBreakdown } from "@/components/pallets/PalletBatchBreakdown";

interface TrackingPallet extends Pallet {
  order?: Booking;
}

type AgentScheduleResponse = {
  deliveries: {
    scheduled_date: string | null;
    scheduled_time: string | null;
    delivery_items: { invoice: { booking_id: string } | null }[];
  }[];
};

type PalletFilter = "all" | Pallet["status"];

const statusLabels: Record<Pallet["status"], string> = {
  draft: "In preparation",
  prepared: "Prepared",
  approved: "In transit",
  shipped: "Shipped",
};

const nextActionLabels: Record<Pallet["status"], string | null> = {
  draft: "Mark prepared",
  prepared: "Mark in transit",
  approved: "Mark shipped",
  shipped: null,
};

function statusClasses(status: Pallet["status"]) {
  if (status === "shipped") return "bg-green/10 text-green";
  if (status === "approved") return "bg-info-soft text-accent-2";
  if (status === "prepared") return "bg-gold/15 text-foreground";
  return "bg-muted text-muted-foreground";
}

export function AgentPalletTracking() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const scanCode = searchParams.get("order")?.trim() ?? "";
  const handledScanKeyRef = useRef<string | null>(null);
  const [scanPalletId, setScanPalletId] = useState<string | null>(null);
  const [pallets, setPallets] = useState<TrackingPallet[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [scheduledOrderIds, setScheduledOrderIds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState(searchParams.get("order") ?? "");
  const [filter, setFilter] = useState<PalletFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedProductKeys, setExpandedProductKeys] = useState<Set<string>>(() => new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [updatingPalletId, setUpdatingPalletId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchTracking = async () => {
    if (!token) return;
    setError("");

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [bookingRes, palletRes, productRes, batchRes, scheduleRes] = await Promise.all([
        fetch("/api/bookings", { headers }),
        fetch("/api/pallets", { headers }),
        fetch("/api/products", { headers }),
        fetch("/api/inventory-batches", { headers }),
        fetch("/api/agent-schedule", { headers }),
      ]);

      if (!bookingRes.ok || !palletRes.ok || !productRes.ok) {
        throw new Error("Could not load pallet tracking.");
      }

      const [bookings, allPallets, productList] = await Promise.all([
        bookingRes.json() as Promise<Booking[]>,
        palletRes.json() as Promise<Pallet[]>,
        productRes.json() as Promise<Product[]>,
      ]);
      const bookingsById = new Map(bookings.map((booking) => [booking.id, booking]));
      const schedule = scheduleRes.ok
        ? await scheduleRes.json() as AgentScheduleResponse
        : { deliveries: [] };
      setScheduledOrderIds(new Set(schedule.deliveries
        .filter((delivery) => delivery.scheduled_date && delivery.scheduled_time)
        .flatMap((delivery) => delivery.delivery_items.flatMap((stop) => stop.invoice?.booking_id ?? []))));

      setProducts(productList);
      setBatches(batchRes.ok ? await batchRes.json() : []);
      setPallets(allPallets
        .filter((pallet) => bookingsById.has(pallet.order_id))
        .map((pallet) => ({ ...pallet, order: bookingsById.get(pallet.order_id) })));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load pallet tracking.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchTracking();
  }, [token]);
  useAutoRefresh(fetchTracking, { enabled: Boolean(token) });

  useEffect(() => {
    if (isLoading || !scanCode || handledScanKeyRef.current === location.key) return;
    handledScanKeyRef.current = location.key;
    setSearch(scanCode);

    const code = scanCode.toLowerCase();
    const pallet = pallets.find((item) => item.id.toLowerCase() === code);
    if (pallet) {
      setScanPalletId(pallet.id);
      return;
    }
    if (!pallets.some((item) => item.order_id.toLowerCase() === code)) {
      setError("No pallet or order matches this barcode.");
    }
  }, [isLoading, location.key, pallets, scanCode]);

  const scanPallet = pallets.find((pallet) => pallet.id === scanPalletId) ?? null;

  const filteredPallets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return pallets.filter((pallet) => {
      if (filter !== "all" && pallet.status !== filter) return false;
      if (!query) return true;
      return [
        pallet.id,
        pallet.order_id,
        pallet.order?.customer?.store_name,
        pallet.order?.customer?.location,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [filter, pallets, search]);

  const productNameFor = (productId: string) =>
    products.find((product) => product.id === productId)?.name ?? productId;

  const toggleProductBatches = (key: string) =>
    setExpandedProductKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const totalUnits = (pallet: Pallet) =>
    (pallet.items ?? []).reduce((sum, item) => sum + item.qty_units, 0);

  const handleAdvancePallet = async (pallet: TrackingPallet): Promise<boolean> => {
    if (!token) return false;
    if ((pallet.status === "prepared" || pallet.status === "approved") && !scheduledOrderIds.has(pallet.order_id)) {
      setError("Schedule this order in Truck Dispatch before moving the pallet into transit or shipping it.");
      return false;
    }

    setUpdatingPalletId(pallet.id);
    setError("");
    try {
      const isApproval = pallet.status === "prepared";
      const nextStatus = pallet.status === "draft" ? "prepared" : "shipped";
      const response = await fetch(
        isApproval ? `/api/pallets/${pallet.id}/approve` : `/api/pallets/${pallet.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          ...(!isApproval && { body: JSON.stringify({ status: nextStatus }) }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update pallet status.");

      if (data.invoice_pending_reason) setError(data.invoice_pending_reason);
      setPallets((current) => current.map((item) =>
        item.id === pallet.id ? { ...data, order: item.order } : item,
      ));
      return true;
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update pallet status.");
      return false;
    } finally {
      setUpdatingPalletId(null);
    }
  };

  const confirmScannedPallet = async () => {
    if (!scanPallet) return;
    if (await handleAdvancePallet(scanPallet)) setScanPalletId(null);
  };

  const handleListAdvance = async (pallet: TrackingPallet) => {
    if (pallet.status === "approved" && !(await confirmAction("Mark this pallet as shipped?"))) return;
    void handleAdvancePallet(pallet);
  };

  if (isLoading) return <LoadingSpinner className="min-h-[60vh] bg-transparent" slow />;

  if (scanPallet) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 px-0 pb-24 pt-5 sm:px-4">
        <header className="flex items-start justify-between gap-3 px-4 sm:px-0">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Scanned pallet</p>
            <h1 className="mt-1 truncate font-rajdhani text-2xl font-bold text-foreground">
              {scanPallet.order?.customer?.store_name ?? "Customer order"}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Pallet {scanPallet.id.slice(0, 8)} · Order {scanPallet.order_id.slice(0, 8)}</p>
          </div>
          <Button
            type="button"
            onClick={() => setScanPalletId(null)}
            disabled={updatingPalletId !== null}
            variant="outline"
          >
            <ArrowLeft size={15} />
            Back
          </Button>
        </header>

        <div className="mx-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:mx-0">
          <div className="flex items-center justify-between rounded-xl bg-muted p-3 text-sm">
            <span className="text-muted-foreground">Current status</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(scanPallet.status)}`}>
              {statusLabels[scanPallet.status]}
            </span>
          </div>

          {error && <p role="alert" className="mt-3 rounded-xl border border-red/20 bg-red/5 p-3 text-sm text-red">{error}</p>}
          {(scanPallet.status === "prepared" || scanPallet.status === "approved") && !scheduledOrderIds.has(scanPallet.order_id) && (
            <p className="mt-3 text-sm text-muted-foreground">Schedule this order in Truck Dispatch before moving the pallet into transit or shipping it.</p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() => setScanPalletId(null)}
              disabled={updatingPalletId !== null}
              variant="outline" className="min-h-11"
            >
              {nextActionLabels[scanPallet.status] ? "Cancel" : "Close"}
            </Button>
            {nextActionLabels[scanPallet.status] && (
              <Button
                type="button"
                onClick={() => void confirmScannedPallet()}
                disabled={updatingPalletId !== null || ((scanPallet.status === "prepared" || scanPallet.status === "approved") && !scheduledOrderIds.has(scanPallet.order_id))}
                variant="default" className="min-h-11"
              >
                {updatingPalletId === scanPallet.id ? "Updating…" : nextActionLabels[scanPallet.status]}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 px-0 pb-24 pt-5 sm:px-4">
      <header className="flex items-start justify-between gap-3 px-4 sm:px-0">
        <div>
          <h1 className="font-rajdhani text-2xl font-bold text-foreground">Pallet Tracking</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Track preparation and dispatch progress for your orders.</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {([
          ["Total", pallets.length],
          ["Preparing", pallets.filter((pallet) => pallet.status === "draft" || pallet.status === "prepared").length],
          ["In transit", pallets.filter((pallet) => pallet.status === "approved").length],
          ["Dispatched", pallets.filter((pallet) => pallet.status === "shipped").length],
        ] as const).map(([label, count]) => (
          <div key={label} className="rounded-2xl border border-border bg-card px-3 py-3">
            <p className="text-xs font-semibold text-muted-foreground">{label}</p>
            <p className="mt-1 font-rajdhani text-2xl font-bold text-foreground">{count}</p>
          </div>
        ))}
      </div>

      <label className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-3 text-muted-foreground focus-within:border-accent-2">
        <Search size={17} />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search pallet, order, or customer"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/80 dark:placeholder:text-foreground/70"
        />
      </label>

      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(value) => value && setFilter(value as typeof filter)}
        aria-label="Filter pallets by status"
        className="justify-start gap-2 overflow-x-auto px-4 pb-1 sm:-mx-4"
      >
        {([
          ["all", "All"],
          ["draft", "Preparing"],
          ["prepared", "Prepared"],
          ["approved", "In transit"],
          ["shipped", "Shipped"],
        ] as const).map(([value, label]) => (
          <ToggleGroupItem key={value} value={value} variant="pill" className="min-h-10 shrink-0 border border-border bg-card data-[state=on]:border-primary">
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {error && <p role="alert" className="rounded-xl border border-red/20 bg-red/5 p-3 text-sm text-red">{error}</p>}

      {filteredPallets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
          <Package size={30} className="mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold text-foreground">{pallets.length ? "No matching pallets" : "No pallets yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pallets.length ? "Try another search or status filter." : "Pallets for your orders will appear here."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredPallets.map((pallet) => {
            const isExpanded = expandedId === pallet.id;
            const customer = pallet.order?.customer;
            const items = pallet.items ?? [];
            const productGroups = groupPalletItemsByProduct(items, batches);

            return (
              <article key={pallet.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : pallet.id)}
                  aria-expanded={isExpanded}
                  className="flex w-full flex-col gap-3 p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">Pallet {pallet.id.slice(0, 8)}</p>
                      <h2 className="mt-0.5 truncate font-semibold text-foreground">{customer?.store_name ?? "Customer order"}</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Order {pallet.order_id.slice(0, 8)} · {new Date(pallet.created_at).toLocaleDateString()}
                      </p>
                      <p className="mt-1 truncate text-xs text-foreground">
                        {items.map((item) => productNameFor(item.product_id)).join(", ") || "No items"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(pallet.status)}`}>
                      {statusLabels[pallet.status]}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                    <span>{productGroups.length} product{productGroups.length === 1 ? "" : "s"} · {totalUnits(pallet)} units</span>
                    <span className="flex items-center gap-1 font-semibold text-accent-2">
                      {isExpanded ? "Hide items" : "View items"}
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border bg-muted/60 px-4 py-3">
                    {customer?.location && <p className="mb-2 text-xs text-muted-foreground">{customer.location}</p>}
                    {items.length ? (
                      <ul className="divide-y divide-border">
                        {productGroups.map((group) => {
                          const key = `${pallet.id}|${group.productId}`;
                          const isOpen = expandedProductKeys.has(key);
                          return (
                            <li key={group.productId} className="py-2 text-sm">
                              <button
                                type="button"
                                onClick={() => toggleProductBatches(key)}
                                aria-expanded={isOpen}
                                className="flex w-full items-center justify-between gap-3 text-left"
                              >
                                <span className="min-w-0">
                                  <span className="block text-foreground">{productNameFor(group.productId)}</span>
                                  <span className="block text-xs text-muted-foreground">{batchSummary(group.batches)}</span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2 font-semibold text-foreground">
                                  × {group.qty}
                                  {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                </span>
                              </button>
                              {isOpen && (
                                <div className="mt-2 pl-1">
                                  <PalletBatchBreakdown lines={group.batches} />
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No pallet items recorded.</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">Updated {new Date(pallet.updated_at).toLocaleDateString()}</p>
                  </div>
                )}

                {pallet.status !== "shipped" && (
                  <div className="border-t border-border p-3">
                    {(pallet.status === "prepared" || pallet.status === "approved") && !scheduledOrderIds.has(pallet.order_id) && (
                      <p className="mb-2 text-xs text-muted-foreground">Schedule this order in Truck Dispatch before moving the pallet into transit or shipping it.</p>
                    )}
                    <Button
                      type="button"
                      onClick={() => handleListAdvance(pallet)}
                      disabled={updatingPalletId !== null || ((pallet.status === "prepared" || pallet.status === "approved") && !scheduledOrderIds.has(pallet.order_id))}
                      variant="default" className="min-h-11 w-full"
                    >
                      {updatingPalletId === pallet.id ? "Updating…" : nextActionLabels[pallet.status]}
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}


    </div>
  );
}
