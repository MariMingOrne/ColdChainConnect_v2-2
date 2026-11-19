import { useState } from "react";
import { Booking, Customer, Product } from "@shared/api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrderProductList } from "./OrderProductList";
import { AgentPendingOrders } from "./AgentPendingOrders";

interface OrderItem {
  product_id: string;
  qty_ordered: number;
}

interface AgentOrderScreenProps {
  customers: Customer[];
  products: Product[];
  productStock: Record<string, number>;
  orderItems: OrderItem[];
  newCustomerId: string;
  preparedDeliveryDate: string;
  isCreating: boolean;
  pendingOrders: Booking[];
  currentUserId: string;
  rollingBackId: string | null;
  onCustomerChange: (customerId: string) => void;
  onPreparedDeliveryDateChange: (date: string) => void;
  onAddItem: (productId: string) => void;
  onRemoveItem: (idx: number) => void;
  onItemChange: (idx: number, field: "product_id" | "qty_ordered", value: string | number) => void;
  onCancel: () => void;
  onCreateOrder: () => void;
  onRollbackOrder: (booking: Booking) => void;
}

export function AgentOrderScreen({
  customers,
  products,
  productStock,
  orderItems,
  newCustomerId,
  preparedDeliveryDate,
  isCreating,
  pendingOrders,
  currentUserId,
  rollingBackId,
  onCustomerChange,
  onPreparedDeliveryDateChange,
  onAddItem,
  onRemoveItem,
  onItemChange,
  onCancel,
  onCreateOrder,
  onRollbackOrder,
}: AgentOrderScreenProps) {
  const today = new Date();
  const minDeliveryDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [view, setView] = useState<"new" | "pending">("new");
  const totalQty = orderItems.reduce((sum, item) => sum + item.qty_ordered, 0);
  const canCreate = !isCreating && !!newCustomerId && orderItems.length > 0;

  return (
    <div className="min-h-full flex flex-col bg-muted">
      <header className="bg-primary text-primary-foreground px-5 pt-5 pb-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-rajdhani text-2xl font-bold">Point of Sale</h1>
            <p className="text-xs text-white/70">Create a customer order</p>
          </div>
          <p className="text-xs font-semibold">
            Total Items: <span className="text-accent-2">{totalQty}</span>
          </p>
        </div>
      </header>

      <div className="flex bg-card border-b border-border">
        {(["new", "pending"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={cn(
              "flex-1 py-3 text-sm font-semibold transition",
              view === key ? "border-b-2 border-accent-2 text-accent-2" : "text-muted-foreground"
            )}
          >
            {key === "new" ? "New Order" : `Pending (${pendingOrders.length})`}
          </button>
        ))}
      </div>

      {view === "new" ? (
        <>
          <div className="flex-1 p-4 space-y-4">
            <section className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">Customer *</label>
                <Select value={newCustomerId || undefined} onValueChange={onCustomerChange}>
                  <SelectTrigger aria-label="Select a customer store">
                    <SelectValue placeholder="Select a customer store" className="min-w-0 truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem
                        key={customer.id}
                        value={customer.id}
                        className="[&>span:last-child]:min-w-0 [&>span:last-child]:truncate"
                      >
                        {customer.store_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {customers.length === 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">No customers are available in your assigned districts.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">Prepared Delivery Date</label>
                <Input
                  type="date"
                  min={minDeliveryDate}
                  value={preparedDeliveryDate}
                  onChange={(e) => onPreparedDeliveryDateChange(e.target.value)}
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
                />
              </div>
            </section>

            <section className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="p-4">
                <OrderProductList
                  products={products}
                  productStock={productStock}
                  orderItems={orderItems}
                  onAddItem={onAddItem}
                  onRemoveItem={onRemoveItem}
                  onItemChange={onItemChange}
                />
              </div>
            </section>
          </div>

          <footer className="mt-auto flex shrink-0 items-center gap-3 border-t border-border bg-card px-4 py-3 shadow-md">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[52px] flex-[0.8] rounded-xl border border-border bg-muted px-4 font-semibold text-sm text-muted-foreground transition hover:bg-border/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onCreateOrder}
              disabled={!canCreate}
              className="min-h-[52px] flex-[1.2] rounded-xl bg-primary px-4 font-semibold text-sm text-primary-foreground transition hover:bg-navy-mid active:scale-[0.98] disabled:opacity-40 disabled:hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
            >
              {isCreating ? "Creating…" : "Create Order"}
            </button>
          </footer>
        </>
      ) : (
        <div className="flex-1 p-4">
          <AgentPendingOrders
            orders={pendingOrders}
            currentUserId={currentUserId}
            rollingBackId={rollingBackId}
            onRollback={onRollbackOrder}
          />
        </div>
      )}
    </div>
  );
}
