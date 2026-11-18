import { toast } from "sonner";
import { confirmAction } from "@/lib/confirm";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Plus, Calendar, CheckCircle, XCircle } from "lucide-react";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { Booking, Truck, Customer, Product } from "@shared/api";
import { useAuth } from "../../hooks/useAuth";
import { useSearchParams } from "react-router-dom";
import { AddOrderModal } from "./AddOrderModal";
import { BookingDetailPage } from "./BookingDetailPage";
import { AgentOrderScreen } from "./AgentOrderScreen";
import { describeCreditBlock, isCreditBlock, promptCreditOverride } from "@/lib/creditOverride";

export function BookingSummary() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productStock, setProductStock] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { token, logout, user, finishPostLoginLoading } = useAuth();
  const isAgent = user?.role === "agent";
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "prep" | "ready">("all");
  const [approvalFilter, setApprovalFilter] = useState<"all" | "approved" | "unapproved">("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<"all" | "today" | "week" | "month" | "custom">("today");
  const [customDateStart, setCustomDateStart] = useState<string>("");
  const [customDateEnd, setCustomDateEnd] = useState<string>("");

  // Approve booking modal
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approveSuccess, setApproveSuccess] = useState<string | null>(null);

  // Reject booking modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  // Order detail modal
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);

  // Add order modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState("");
  const [preparedDeliveryDate, setPreparedDeliveryDate] = useState("");
  const [orderItems, setOrderItems] = useState<{ product_id: string; qty_ordered: number }[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const requestedStatus = searchParams.get("status");
    if (["pending", "approved", "prep", "ready"].includes(requestedStatus ?? "")) {
      setStatusFilter(requestedStatus as "pending" | "approved" | "prep" | "ready");
      setDateRangeFilter("all");
    }

    if (!isAgent && searchParams.get("action") === "new") {
      setShowAddModal(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("action");
      setSearchParams(nextParams, { replace: true });
    }
  }, [isAgent, searchParams, setSearchParams]);

  const fetchAll = async () => {
    try {
      const [bRes, tRes, cRes, pRes, invRes] = await Promise.all([
        fetch("/api/bookings", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/trucks", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/customers", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/products", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/products/inventory", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (bRes.ok) setBookings(await bRes.json());
      if (tRes.ok) setTrucks(await tRes.json());
      if (cRes.ok) setCustomers(await cRes.json());
      if (pRes.ok) setProducts(await pRes.json());
      if (invRes.ok) setProductStock(await invRes.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading data");
    } finally {
      setIsLoading(false);
      finishPostLoginLoading();
    }
  };

  useEffect(() => { if (token) fetchAll(); }, [token]);
  useAutoRefresh(fetchAll, { enabled: Boolean(token) });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-warning-soft text-warning",
      approved: "bg-info-soft text-link",
      rejected: "bg-destructive-soft text-destructive",
      prep: "bg-info-soft text-link",
      ready: "bg-success-soft text-success",
    };
    return colors[status] || "bg-muted text-foreground";
  };

  const isDateInRange = (dateStr: string): boolean => {
    if (dateRangeFilter === "all") return true;

    const bookingDate = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const bookingDateOnly = new Date(
      bookingDate.getFullYear(),
      bookingDate.getMonth(),
      bookingDate.getDate()
    );

    if (dateRangeFilter === "today") {
      return bookingDateOnly.getTime() === today.getTime();
    }

    if (dateRangeFilter === "week") {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return bookingDateOnly >= weekStart && bookingDateOnly <= weekEnd;
    }

    if (dateRangeFilter === "month") {
      return (
        bookingDate.getFullYear() === now.getFullYear() &&
        bookingDate.getMonth() === now.getMonth()
      );
    }

    if (dateRangeFilter === "custom") {
      if (!customDateStart || !customDateEnd) return true;
      const start = new Date(customDateStart);
      const end = new Date(customDateEnd);
      end.setHours(23, 59, 59, 999);
      return bookingDate >= start && bookingDate <= end;
    }

    return true;
  };

  // ── Add Order ──────────────────────────────────────────────
  const handleAddItem = (productId: string) =>
    setOrderItems((prev) => [...prev, { product_id: productId, qty_ordered: 1 }]);

  const handleRemoveItem = (idx: number) =>
    setOrderItems((prev) => prev.filter((_, i) => i !== idx));

  const handleItemChange = (idx: number, field: "product_id" | "qty_ordered", value: string | number) => {
    setOrderItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      if (field === "qty_ordered") {
        const maxStock = productStock[item.product_id] || 0;
        const qty = typeof value === "number" ? value : parseInt(value) || 1;
        return { ...item, qty_ordered: Math.min(qty, maxStock) };
      }
      return { ...item, product_id: String(value) };
    }));
  };

  const getMaxQtyForProduct = (productId: string): number => {
    return productStock[productId] || 0;
  };

  const submitOrder = async (override?: { reason: string }) => {
    if (!newCustomerId) {
      toast.error("Please select a customer");
      return;
    }
    const emptyItems = orderItems.filter((i) => !i.product_id);
    if (emptyItems.length > 0) {
      toast.error(`Please select a product for ${emptyItems.length} item${emptyItems.length > 1 ? "s" : ""}`);
      return;
    }
    if (orderItems.length === 0) {
      toast.error("Please add at least one item to the order");
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customer_id: newCustomerId,
          prepared_delivery_date: preparedDeliveryDate || undefined,
          items: orderItems,
          ...(override && { ar_override: true, ar_override_reason: override.reason }),
        }),
      });
      if (res.status === 401) {
        toast.error("Your session has expired or your account was not found. Please log in again.");
        await logout();
        return;
      }
      if (res.status === 409) {
        const block: unknown = await res.json();
        if (isCreditBlock(block)) {
          const reason = override ? null : promptCreditOverride(block);
          if (reason) return await submitOrder({ reason });
          toast.error(describeCreditBlock(block));
          return;
        }
      }
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create order");
      }
      const created = await res.json();
      setBookings((prev) => [created, ...prev]);
      setShowAddModal(false);
      setNewCustomerId("");
      setPreparedDeliveryDate("");
      setOrderItems([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateOrder = () => submitOrder();

  const resetOrderDraft = () => {
    setNewCustomerId("");
    setPreparedDeliveryDate("");
    setOrderItems([]);
  };

  const handleRollbackOrder = async (booking: Booking) => {
    if (!(await confirmAction("Roll back this order? It will be permanently deleted."))) return;
    setRollingBackId(booking.id);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to roll back order");
      }
      setBookings((prev) => prev.filter((b) => b.id !== booking.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to roll back order");
    } finally {
      setRollingBackId(null);
    }
  };

  // ── Order Detail Modal ────────────────────────────────────────
  const openDetailModal = (booking: Booking) => {
    setDetailBooking(booking);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setDetailBooking(null);
  };

  // ── Approve Booking ───────────────────────────────────────────
  const openApproveModal = (booking: Booking) => {
    setSelectedBooking(booking);
    setApproveSuccess(null);
    setShowApproveModal(true);
  };

  const closeApproveModal = () => {
    setShowApproveModal(false);
    setSelectedBooking(null);
    setApproveSuccess(null);
  };

  const handleApproveBooking = async () => {
    if (!selectedBooking) return void toast.error("No booking selected");
    setIsApproving(true);
    try {
      const res = await fetch(`/api/bookings/${selectedBooking.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "approved" }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to approve booking");
      }
      const { booking: updated } = await res.json();
      setBookings((prev) => prev.map((b) => b.id === updated.id ? updated : b));
      setApproveSuccess("Order approved. The invoice will be created after stock picking is complete.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve booking");
    } finally {
      setIsApproving(false);
    }
  };

  const handleUnapproveBooking = async (booking: Booking) => {
    if (!(await confirmAction("Are you sure you want to unapprove this order? It will return to pending status."))) return;
    try {
      const res = await fetch(`/api/bookings/${booking.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "pending" }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to unapprove booking");
      }
      const updated = await res.json();
      setBookings((prev) => prev.map((b) => b.id === updated.id ? updated : b));
      toast.success("Order moved back to pending status.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unapprove booking");
    }
  };

  const openRejectModal = (booking: Booking) => {
    setSelectedBooking(booking);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const closeRejectModal = () => {
    setShowRejectModal(false);
    setSelectedBooking(null);
    setRejectReason("");
  };

  const handleRejectBooking = async () => {
    if (!selectedBooking) return void toast.error("No booking selected");
    setIsRejecting(true);
    try {
      const res = await fetch(`/api/bookings/${selectedBooking.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "rejected" }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to reject booking");
      }
      const updated = await res.json();
      setBookings((prev) => prev.map((b) => b.id === updated.id ? updated : b));
      closeRejectModal();
      toast.success("Order rejected successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject booking");
    } finally {
      setIsRejecting(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;

  if (isAgent) {
    return (
      <AgentOrderScreen
        customers={customers}
        products={products}
        productStock={productStock}
        orderItems={orderItems}
        newCustomerId={newCustomerId}
        preparedDeliveryDate={preparedDeliveryDate}
        isCreating={isCreating}
        onCustomerChange={setNewCustomerId}
        onPreparedDeliveryDateChange={setPreparedDeliveryDate}
        onAddItem={handleAddItem}
        onRemoveItem={handleRemoveItem}
        onItemChange={handleItemChange}
        pendingOrders={bookings.filter((b) => b.status === "pending")}
        currentUserId={user?.id ?? ""}
        rollingBackId={rollingBackId}
        onCancel={resetOrderDraft}
        onCreateOrder={handleCreateOrder}
        onRollbackOrder={handleRollbackOrder}
      />
    );
  }

  if (showAddModal) {
    return (
      <AddOrderModal
        onClose={() => {
          setShowAddModal(false);
          setNewCustomerId("");
          setPreparedDeliveryDate("");
          setOrderItems([{ product_id: "", qty_ordered: 1 }]);
        }}
        customers={customers}
        products={products}
        productStock={productStock}
        orderItems={orderItems}
        newCustomerId={newCustomerId}
        preparedDeliveryDate={preparedDeliveryDate}
        onCustomerChange={setNewCustomerId}
        onPreparedDeliveryDateChange={setPreparedDeliveryDate}
        onAddItem={handleAddItem}
        onRemoveItem={handleRemoveItem}
        onItemChange={handleItemChange}
        onCreateOrder={handleCreateOrder}
        isCreating={isCreating}
      />
    );
  }

  if (showApproveModal && selectedBooking) {
    return (
      <div className="flex-1 flex flex-col p-6 gap-6">
        <div className="page-header">
          <div>
            <h1 className="page-title">Approve Order</h1>
            <p className="page-subtitle">Confirm approval for this customer order</p>
          </div>
          <button onClick={closeApproveModal} className="btn-ghost">
            <ArrowLeft size={15} />
            Back
          </button>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 space-y-4 max-w-2xl">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Order ID</label>
            <div className="px-3 py-2 bg-muted rounded-lg text-sm font-mono text-foreground">
              {selectedBooking.id.slice(0, 8)}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Customer</label>
            <div className="px-3 py-2 bg-muted rounded-lg text-sm text-foreground">
              <span className="font-semibold">{selectedBooking.customer?.store_name || "Unknown"}</span>
              {selectedBooking.customer?.contact_info && (
                <span className="text-xs text-muted-foreground block">{selectedBooking.customer.contact_info}</span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Location</label>
            <div className="px-3 py-2 bg-muted rounded-lg text-sm text-foreground">
              {selectedBooking.customer?.location || "Unknown"}
            </div>
          </div>

          {approveSuccess ? (
            <div className="px-4 py-3 bg-success-soft border border-success/30 rounded-lg text-sm text-success font-semibold">
              ✓ {approveSuccess}
            </div>
          ) : (
            <div className="px-4 py-3 bg-info-soft border border-link/30 rounded-lg text-sm text-link">
              The truck will be automatically assigned based on the customer's truck district.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 max-w-2xl">
          <button onClick={closeApproveModal} className="btn-ghost">
            {approveSuccess ? "Close" : "Cancel"}
          </button>
          {!approveSuccess && (
            <button
              onClick={handleApproveBooking}
              disabled={isApproving}
              className="btn-primary disabled:opacity-50"
            >
              {isApproving ? "Approving…" : "Approve Order"}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (showRejectModal && selectedBooking) {
    return (
      <div className="flex-1 flex flex-col p-6 gap-6">
        <div className="page-header">
          <div>
            <h1 className="page-title">Reject Order</h1>
            <p className="page-subtitle">Confirm rejection of this customer order</p>
          </div>
          <button onClick={closeRejectModal} className="btn-ghost">
            <ArrowLeft size={15} />
            Back
          </button>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 space-y-4 max-w-2xl">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Order ID</label>
            <div className="px-3 py-2 bg-muted rounded-lg text-sm font-mono text-foreground">
              {selectedBooking.id.slice(0, 8)}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Customer</label>
            <div className="px-3 py-2 bg-muted rounded-lg text-sm text-foreground">
              <span className="font-semibold">{selectedBooking.customer?.store_name || "Unknown"}</span>
              {selectedBooking.customer?.contact_info && (
                <span className="text-xs text-muted-foreground block">{selectedBooking.customer.contact_info}</span>
              )}
            </div>
          </div>
          <div className="bg-destructive-soft p-3 rounded-lg border border-destructive/30">
            <p className="text-xs text-destructive">
              This order will be marked as rejected and cannot be processed further. This action cannot be undone easily.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 max-w-2xl">
          <button onClick={closeRejectModal} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleRejectBooking}
            disabled={isRejecting}
            className="btn-danger bg-red text-white border-red hover:bg-red/80 disabled:opacity-50"
          >
            {isRejecting ? "Rejecting…" : "Reject Order"}
          </button>
        </div>
      </div>
    );
  }

  if (showDetailModal && detailBooking) {
    return (
      <BookingDetailPage
        booking={detailBooking}
        products={products}
        getStatusColor={getStatusColor}
        onBack={closeDetailModal}
      />
    );
  }

  const filtered = bookings.filter((b) => {
    const matchesSearch =
      b.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.customer_id.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;

    // Check approval status
    if (approvalFilter !== "all") {
      const isApproved = b.status === "approved";
      if (approvalFilter === "approved" && !isApproved) return false;
      if (approvalFilter === "unapproved" && isApproved) return false;
    }

    // Check date range filter
    if (!isDateInRange(b.created_at)) return false;

    return true;
  });

  return (
    <div className="flex-1 flex flex-col p-6 gap-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Order Summary</h1>
          <p className="page-subtitle">Review, approve, and reject customer orders</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> Add Order
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-4 bg-destructive-soft border-destructive/30">
          <p className="text-destructive">{error}</p>
        </Card>
      )}

      <SearchFilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="Search by order ID or customer ID…"
        className="!justify-start"
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
            name: "approvalFilter",
            value: approvalFilter,
            onChange: (value) => setApprovalFilter(value as any),
            options: [
              { label: "All Orders", value: "all" },
              { label: "Approved", value: "approved" },
              { label: "Unapproved", value: "unapproved" },
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
            <label className="block text-sm font-medium text-foreground mb-1">
              Start Date
            </label>
            <div className="flex items-center rounded-full border border-border bg-card px-4 gap-2">
              <Calendar size={16} className="text-muted-foreground" />
              <Input
                type="date"
                value={customDateStart}
                onChange={(e) => setCustomDateStart(e.target.value)}
                className="flex-1 bg-transparent border-none text-foreground py-2 outline-none text-sm"
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-foreground mb-1">
              End Date
            </label>
            <div className="flex items-center rounded-full border border-border bg-card px-4 gap-2">
              <Calendar size={16} className="text-muted-foreground" />
              <Input
                type="date"
                value={customDateEnd}
                onChange={(e) => setCustomDateEnd(e.target.value)}
                className="flex-1 bg-transparent border-none text-foreground py-2 outline-none text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden rounded-xl shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="whitespace-nowrap">
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Prepared Delivery Date</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {bookings.length === 0 ? "No orders found" : "No orders match your search"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((booking) => {
                const customer = booking.customer;
                const creator = (booking as any).creator;
                const isApproved = booking.status === "approved";
                return (
                  <TableRow key={booking.id}>
                    <TableCell className="font-mono text-sm">
                      <button
                        onClick={() => openDetailModal(booking)}
                        className="text-accent-2 hover:underline font-semibold transition"
                      >
                        {booking.id.slice(0, 8)}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm">
                      {customer ? (
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">{customer.store_name}</span>
                          {customer.contact_info && (
                            <span className="text-xs text-muted-foreground">{customer.contact_info}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Unknown customer</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {creator ? (
                        <span className="font-semibold text-foreground">{creator.username}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Unknown</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-sm ${
                        isApproved
                          ? "bg-success-soft text-success"
                          : "bg-warning-soft text-warning"
                      }`}>
                        {isApproved ? "Approved" : "Pending"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-sm ${getStatusColor(booking.status)}`}>
                        {booking.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {booking.prepared_delivery_date
                        ? new Date(`${booking.prepared_delivery_date}T00:00:00`).toLocaleDateString()
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(booking.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {booking.status === "pending" ? (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => openApproveModal(booking)}
                            className="btn-accent whitespace-nowrap"
                          >
                            <CheckCircle size={14} />
                            Approve
                          </button>
                          <button
                            onClick={() => openRejectModal(booking)}
                            className="btn-danger whitespace-nowrap"
                          >
                            <XCircle size={14} />
                            Reject
                          </button>
                        </div>
                      ) : booking.status === "approved" ? (
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleUnapproveBooking(booking)}
                            className="btn-secondary whitespace-nowrap"
                          >
                            <XCircle size={14} />
                            Unapprove
                          </button>
                        </div>
                      ) : (
                        <span className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted rounded-lg capitalize border border-border">{booking.status}</span>
                      )}
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
