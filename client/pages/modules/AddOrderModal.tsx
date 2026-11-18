import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NativeSelect } from "@/components/ui/native-select";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuantityStepper } from "./QuantityStepper";
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
  const [selectedTab, setSelectedTab] = useState<"products" | "cart">("products");
  const [productSearch, setProductSearch] = useState("");

  const getImageUrl = (imageFilename?: string): string => {
    if (!imageFilename) return "/placeholder.svg";
    if (imageFilename.startsWith("http")) return imageFilename;
    return `/uploads/${imageFilename}`;
  };

  const getStockStatus = (productId: string): { stock: number; isOutOfStock: boolean } => {
    const stock = productStock[productId] || 0;
    return { stock, isOutOfStock: stock === 0 };
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
        <Button onClick={onClose} variant="outline">
          <ArrowLeft size={15} />
          Back
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-border flex-1 flex flex-col overflow-hidden">

        {/* Customer Selection */}
        <div className="bg-muted px-6 py-3 border-b border-border">
          <label htmlFor="addordermodal-select-customer" className="block text-xs font-semibold text-foreground mb-2">Select Customer *</label>
          <NativeSelect id="addordermodal-select-customer"
            value={newCustomerId}
            onChange={(e) => onCustomerChange(e.target.value)}
            className="w-full"
          >
            <option value="">Choose a customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.store_name} — {c.location}
              </option>
            ))}
          </NativeSelect>
          <label htmlFor="addordermodal-prepared-delivery-date" className="mt-3 block text-xs font-semibold text-foreground mb-2">Prepared Delivery Date</label>
          <Input id="addordermodal-prepared-delivery-date"
            type="date"
            min={minDeliveryDate}
            value={preparedDeliveryDate}
            onChange={(e) => onPreparedDeliveryDateChange(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
          />
        </div>

        <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as typeof selectedTab)} className="flex flex-1 flex-col">
        <TabsList variant="underline" aria-label="Order builder">
          <TabsTrigger variant="underline" value="products" className="flex-1">Browse Products</TabsTrigger>
          <TabsTrigger variant="underline" value="cart" className="flex-1">Order Items ({getTotalQuantity()})</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="mt-0 flex-1 overflow-y-auto p-6 min-h-[400px] focus-visible:ring-inset focus-visible:ring-offset-0">
          {selectedTab === "products" ? (
            <div className="space-y-4">
              <Input
                type="text"
                placeholder="Search by product name or SKU…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
              />
              <div className="space-y-2">
                {filteredProducts.map((product) => {
                const { stock, isOutOfStock } = getStockStatus(product.id);
                const isSelected = orderItems.some((item) => item.product_id === product.id);

                return (
                  <button
                    key={product.id}
                    onClick={() => {
                      if (isSelected) {
                        const itemIdx = orderItems.findIndex((item) => item.product_id === product.id);
                        if (itemIdx !== -1) onRemoveItem(itemIdx);
                      } else if (!isOutOfStock) {
                        onAddItem(product.id);
                      }
                    }}
                    disabled={isOutOfStock}
                    className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 transition ${
                      isOutOfStock
                        ? "border-destructive/30 bg-destructive-soft opacity-60 cursor-not-allowed"
                        : isSelected
                          ? "border-accent-2 bg-info-soft"
                          : "border-border bg-card hover:border-accent-2 hover:shadow-md cursor-pointer"
                    }`}
                  >
                    {/* Image */}
                    <div className="w-16 h-16 flex-shrink-0 bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                      <img
                        src={getImageUrl(product.image_filename)}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/placeholder.svg";
                        }}
                      />
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 text-left">
                      <h3 className="font-semibold text-sm text-foreground mb-1">{product.name}</h3>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-bold text-accent-2">₱{product.price}</p>
                        <div
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            isOutOfStock
                              ? "bg-destructive-soft text-destructive"
                              : stock < 10
                                ? "bg-warning-soft text-warning"
                                : "bg-success-soft text-success"
                          }`}
                        >
                          {isOutOfStock ? "Out of Stock" : `${stock} available`}
                        </div>
                      </div>
                    </div>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <div className="px-3 py-1 bg-accent-2 text-white text-xs font-semibold rounded">
                        ✓ Added
                      </div>
                    )}
                  </button>
                );
              })}
              </div>
              {filteredProducts.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground text-sm">No products found matching "{productSearch}"</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {orderItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground text-sm mb-4">No items added yet. Browse products to add items.</p>
                  <Button
                    onClick={() => setSelectedTab("products")}
                    variant="default"
                  >
                    Browse Products
                  </Button>
                </div>
              ) : (
                <>
                  {orderItems.map((item, idx) => {
                    const product = products.find((p) => p.id === item.product_id);
                    const maxQty = productStock[item.product_id] || 0;

                    if (!product) return null;

                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-4 border border-border rounded-lg bg-muted"
                      >
                        <img
                          src={getImageUrl(product.image_filename)}
                          alt={product.name}
                          className="w-16 h-16 object-cover rounded"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/placeholder.svg";
                          }}
                        />
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm text-foreground">{product.name}</h4>
                          <p className="text-xs text-muted-foreground">₱{product.price}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <QuantityStepper
                            value={item.qty_ordered}
                            min={1}
                            max={maxQty}
                            onChange={(qty) => onItemChange(idx, "qty_ordered", qty)}
                          />
                          <span className="text-xs text-muted-foreground">{maxQty} available</span>
                        </div>
                        <Button
                          onClick={() => onRemoveItem(idx)} type="button" variant="ghost" size="icon" aria-label="Remove item" className="h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="bg-muted px-6 py-4 flex justify-between items-center border-t border-border">
          <div className="text-sm">
            {getTotalQuantity() > 0 && (
              <p className="font-semibold text-foreground">
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
