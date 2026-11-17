import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Calendar } from "lucide-react";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { Booking, Customer, Pallet } from "@shared/api";
import { useAuth } from "../../hooks/useAuth";

export function Preparation() {
  const [orders, setOrders] = useState<Booking[]>([]);
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  const filters = state?.preparationFilters;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>(filters?.searchTerm ?? "");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "prep" | "ready">(filters?.statusFilter ?? "approved");
  const [dateRangeFilter, setDateRangeFilter] = useState<"all" | "today" | "week" | "month" | "custom">(filters?.dateRangeFilter ?? "today");
  const [customDateStart, setCustomDateStart] = useState<string>(filters?.customDateStart ?? "");
  const [customDateEnd, setCustomDateEnd] = useState<string>(filters?.customDateEnd ?? "");

  const fetchAll = async () => {
    try {
      const responses = await Promise.all([
        fetch("/api/bookings", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/pallets", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/customers", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const failedIndex = responses.findIndex((response) => !response.ok);
      if (failedIndex !== -1) {
        const resource = ["orders", "pallets", "customers"][failedIndex];
        throw new Error(`Could not load ${resource} (HTTP ${responses[failedIndex].status}).`);
      }

      const [ordersData, palletsData, customersData] = await Promise.all(
        responses.map((response) => response.json())
      );
      setOrders(ordersData);
      setPallets(palletsData);
      setCustomers(customersData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAll();
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (token) {
      fetchAll();
    }
  }, [token]);

  const isDateInRange = (dateStr: string): boolean => {
    if (dateRangeFilter === "all") return true;

    const orderDate = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const orderDateOnly = new Date(
      orderDate.getFullYear(),
      orderDate.getMonth(),
      orderDate.getDate()
    );

    if (dateRangeFilter === "today") {
      return orderDateOnly.getTime() === today.getTime();
    }

    if (dateRangeFilter === "week") {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return orderDateOnly >= weekStart && orderDateOnly <= weekEnd;
    }

    if (dateRangeFilter === "month") {
      return (
        orderDate.getFullYear() === now.getFullYear() &&
        orderDate.getMonth() === now.getMonth()
      );
    }

    if (dateRangeFilter === "custom") {
      if (!customDateStart || !customDateEnd) return true;
      const start = new Date(customDateStart);
      const end = new Date(customDateEnd);
      end.setHours(23, 59, 59, 999);
      return orderDate >= start && orderDate <= end;
    }

    return true;
  };

  if (isLoading) return <LoadingSpinner className="fixed inset-0 z-0 min-h-0 bg-off-white" slow />;

  const filtered = orders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer_id.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter !== "all" && order.status !== statusFilter) return false;
    if (!isDateInRange(order.created_at)) return false;

    return true;
  });

  const ordersReadyForPrep = filtered.length;
  const pendingPalletItems = orders.reduce((sum, order) => {
    const orderPallets = pallets.filter((p) => p.order_id === order.id && p.status === "draft");
    return (
      sum +
      orderPallets.reduce((pSum, p) => pSum + (p.items?.length ?? 0), 0)
    );
  }, 0);
  const palletsCreatedToday = pallets.filter((p) => {
    const today = new Date();
    const pDate = new Date(p.created_at);
    return (
      pDate.getFullYear() === today.getFullYear() &&
      pDate.getMonth() === today.getMonth() &&
      pDate.getDate() === today.getDate()
    );
  }).length;

  const isOrderPrepared = (orderId: string): boolean => {
    const orderPallets = pallets.filter((p) => p.order_id === orderId);
    return orderPallets.length > 0 && orderPallets.every((p) => p.status === "prepared" || p.status === "approved" || p.status === "shipped");
  };

  const handleMarkPrepared = async (orderId: string) => {
    try {
      const orderPallets = pallets.filter((p) => p.order_id === orderId && p.status === "draft");
      for (const pallet of orderPallets) {
        const response = await fetch(`/api/pallets/${pallet.id}/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: "prepared" }),
        });
        if (!response.ok) throw new Error("Failed to mark pallet as prepared.");
      }
      handleRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark pallets as prepared");
    }
  };

  const handleUndoPrepared = async (orderId: string) => {
    try {
      const orderPallets = pallets.filter((p) => p.order_id === orderId && p.status === "prepared");
      for (const pallet of orderPallets) {
        const response = await fetch(`/api/pallets/${pallet.id}/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: "draft" }),
        });
        if (!response.ok) throw new Error("Failed to undo pallet preparation.");
      }
      handleRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to undo prepared status");
    }
  };

  const handleDeleteOrderPallets = async (orderId: string) => {
    try {
      const orderPallets = pallets.filter((p) => p.order_id === orderId && p.status === "draft");
      for (const pallet of orderPallets) {
        await fetch(`/api/pallets/${pallet.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
      handleRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete pallets");
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-6 p-4 md:p-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pallet Preparation</h1>
          <p className="page-subtitle">Build pallets for approved customer orders</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="btn-ghost"
        >
          <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-red-700">{error}</p>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-xs text-muted font-semibold uppercase tracking-tight">Orders Ready</p>
          <p className="text-2xl font-bold text-accent-2 mt-1">{ordersReadyForPrep}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted font-semibold uppercase tracking-tight">Items Pending</p>
          <p className="text-2xl font-bold text-gold mt-1">{pendingPalletItems}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted font-semibold uppercase tracking-tight">Pallets Today</p>
          <p className="text-2xl font-bold text-green mt-1">{palletsCreatedToday}</p>
        </div>
      </div>

      {/* Filters */}
      <SearchFilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="Search by order ID or customer ID…"
        filters={[
          {
            name: "statusFilter",
            value: statusFilter,
            onChange: (value) => setStatusFilter(value as any),
            options: [
              { label: "All Status", value: "all" },
              { label: "Pending", value: "pending" },
              { label: "Approved", value: "approved" },
              { label: "Prep", value: "prep" },
              { label: "Ready", value: "ready" },
            ],
          },
          {
            name: "dateRangeFilter",
            value: dateRangeFilter,
            onChange: (value) => setDateRangeFilter(value as any),
            options: [
              { label: "All Dates", value: "all" },
              { label: "This Day", value: "today" },
              { label: "This Week", value: "week" },
              { label: "This Month", value: "month" },
              { label: "Custom", value: "custom" },
            ],
          },
        ]}
      />

      {/* Custom Date Picker */}
      {dateRangeFilter === "custom" && (
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-navy mb-1">
              Start Date
            </label>
            <div className="flex items-center rounded-full border border-border bg-white px-4 gap-2">
              <Calendar size={16} className="text-muted" />
              <Input
                type="date"
                value={customDateStart}
                onChange={(e) => setCustomDateStart(e.target.value)}
                className="flex-1 bg-transparent border-none text-navy py-2 outline-none text-sm"
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-navy mb-1">
              End Date
            </label>
            <div className="flex items-center rounded-full border border-border bg-white px-4 gap-2">
              <Calendar size={16} className="text-muted" />
              <Input
                type="date"
                value={customDateEnd}
                onChange={(e) => setCustomDateEnd(e.target.value)}
                className="flex-1 bg-transparent border-none text-navy py-2 outline-none text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Orders Table */}
      <Card className="overflow-hidden rounded-xl shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted">
                  {orders.length === 0 ? "No orders found" : "No orders match your search"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((order) => {
                const customer = customers.find((c) => c.id === order.customer_id);
                const itemCount = order.booking_items?.length ?? 0;
                const orderPallets = pallets.filter((p) => p.order_id === order.id);
                const approvedPalletCount = orderPallets.filter((p) => p.status === "approved").length;
                const draftPalletCount = orderPallets.filter((p) => p.status === "draft").length;
                const isPrepared = isOrderPrepared(order.id);

                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm font-semibold text-accent-2">
                      {order.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-col">
                        <span className="font-semibold text-navy">{customer?.store_name || "Unknown"}</span>
                        {customer?.location && (
                          <span className="text-xs text-muted">{customer.location}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="space-y-1">
                        {order.booking_items && order.booking_items.length > 0 ? (
                          <>
                            {order.booking_items.map((item) => (
                              <div key={item.id} className="text-xs">
                                <span className="font-semibold text-navy">{item.product?.name || item.product_id}</span>
                                <span className="text-muted"> × {item.qty_ordered}</span>
                              </div>
                            ))}
                          </>
                        ) : (
                          <span className="font-semibold text-muted">No items</span>
                        )}
                      </div>
                      {approvedPalletCount > 0 && (
                        <span className="text-xs text-green-600 block mt-1">
                          {approvedPalletCount} pallet(s) ready
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(order.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end items-center whitespace-nowrap">
                        {/* Prepare: only show when no pallets created yet and not prepared */}
                        {draftPalletCount === 0 && !isPrepared && (
                          <button
                            onClick={() => {
                              const preparationFilters = { searchTerm, statusFilter, dateRangeFilter, customDateStart, customDateEnd };
                              navigate("/booking-dispatch/preparation", { replace: true, state: { preparationFilters } });
                              navigate(`/booking-dispatch/preparation/${encodeURIComponent(order.id)}`, {
                                state: { fromPreparation: true },
                              });
                            }}
                            className="px-3 py-2 text-sm font-semibold bg-accent-2 text-white rounded-lg hover:opacity-80 transition"
                          >
                            Prepare
                          </button>
                        )}
                        {/* Prepared: show when pallets are drafted but not yet marked prepared */}
                        {draftPalletCount > 0 && !isPrepared && (
                          <>
                            <button
                              onClick={() => navigate(`/booking-dispatch/inventory?order=${order.id}`)}
                              className="px-3 py-2 text-sm font-semibold bg-green text-white rounded-lg hover:opacity-80 transition"
                            >
                              Prepared
                            </button>
                            <button
                              onClick={() => handleDeleteOrderPallets(order.id)}
                              className="px-3 py-2 text-sm font-semibold bg-gold text-navy rounded-lg hover:opacity-80 transition"
                              title={`Remove ${draftPalletCount} pallet(s) for this order`}
                            >
                              Undo
                            </button>
                          </>
                        )}
                        {/* After marked prepared: show badge + Undo */}
                        {isPrepared && (
                          <>
                            <span className="px-3 py-2 text-xs font-semibold text-green bg-green/10 rounded-lg">
                              ✓ Prepared
                            </span>
                            <button
                              onClick={() => handleUndoPrepared(order.id)}
                              className="px-3 py-2 text-sm font-semibold bg-gold text-navy rounded-lg hover:opacity-80 transition"
                            >
                              Undo
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

    </div>
  );
}
