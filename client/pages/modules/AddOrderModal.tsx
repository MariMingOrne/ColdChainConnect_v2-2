import { useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductOrderRow } from "./ProductOrderRow";
import { Product, Customer } from "@shared/api";

interface OrderItem {
  product_id: string;
  qty_ordered: number;
}

interface AddOrderModalProps {
  onClose: () => void;
  customers: Customer[];
  products: Product[];
  productStock: Record<string, number>;
  orderItems: OrderItem[];
  newCustomerId: string;
  preparedDeliveryDate: string;
  onCustomerChange: (customerId: string) => void;
  onPreparedDeliveryDateChange: (date: string) => void;
  onAddItem: (productId: string) => void;
  onRemoveItem: (idx: number) => void;
  onItemChange: (idx: number, field: "product_id" | "qty_ordered", value: string | number) => void;
  onCreateOrder: () => void;
  isCreating: boolean;
}

export function AddOrderModal({
  onClose,
  customers,
  products,
  productStock,
  orderItems,
  newCustomerId,
  preparedDeliveryDate,
  onCustomerChange,
  onPreparedDeliveryDateChange,
  onAddItem,
  onRemoveItem,
  onItemChange,
  onCreateOrder,
  isCreating,
}: AddOrderModalProps) {
  const today = new Date();
  const minDeliveryDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [productSearch, setProductSearch] = useState("");

  const getImageUrl = (imageFilename?: string): string => {
    if (!imageFilename) return "/placeholder.svg";
    if (imageFilename.startsWith("http")) return imageFilename;
    return `/uploads/${imageFilename}`;
  };

  const getTotalQuantity = (): number => {
    return orderItems.reduce((sum, item) => sum + item.qty_ordered, 0);
  };

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (product.sku && product.sku.toLowerCase().includes(productSearch.toLowerCase()))
  );

  return (
    <div className="flex-1 flex flex-col p-6 gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Add New Order</h1>
          <p className="page-subtitle">Select a customer and add products to the order</p>
        </div>
        <button onClick={onClose} className="btn-ghost">
          <ArrowLeft size={15} />
          Back
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-border flex-1 flex flex-col overflow-hidden">

        {/* Customer Selection */}
        <div className="bg-off-white px-6 py-3 border-b border-border">
          <label className="block text-xs font-semibold text-navy mb-2">Select Customer *</label>
          <select
            value={newCustomerId}
            onChange={(e) => onCustomerChange(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
          >
            <option value="">Choose a customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.store_name} — {c.location}
              </option>
            ))}
          </select>
          <label className="mt-3 block text-xs font-semibold text-navy mb-2">Prepared Delivery Date</label>
          <Input
            type="date"
            min={minDeliveryDate}
            value={preparedDeliveryDate}
            onChange={(e) => onPreparedDeliveryDateChange(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
          />
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto p-6 min-h-[400px] space-y-4">
          <Input
            type="text"
            placeholder="Search by product name or SKU…"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
          />
          <div className="space-y-2">
            {filteredProducts.map((product) => {
              const itemIdx = orderItems.findIndex((item) => item.product_id === product.id);
              const selectedItem = itemIdx !== -1 ? orderItems[itemIdx] : undefined;

              return (
                <ProductOrderRow
                  key={product.id}
                  product={product}
                  imageUrl={getImageUrl(product.image_filename)}
                  stock={productStock[product.id] || 0}
                  selectedQty={selectedItem?.qty_ordered}
                  onAdd={() => onAddItem(product.id)}
                  onRemove={() => onRemoveItem(itemIdx)}
                  onQuantityChange={(qty) => onItemChange(itemIdx, "qty_ordered", qty)}
                />
              );
            })}
          </div>
          {filteredProducts.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted text-sm">No products found matching "{productSearch}"</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-off-white px-6 py-4 flex justify-between items-center border-t border-border">
          <div className="text-sm">
            {getTotalQuantity() > 0 && (
              <p className="font-semibold text-navy">
                Total Items: <span className="text-accent-2">{getTotalQuantity()}</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="button" variant="accent" onClick={onCreateOrder} disabled={isCreating || !newCustomerId || orderItems.length === 0}>
              <Plus size={16} />
              {isCreating ? "Creating…" : "Create Order"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
