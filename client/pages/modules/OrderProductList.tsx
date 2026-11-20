import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Product } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { QuantityStepper } from "./QuantityStepper";

interface OrderItem {
  product_id: string;
  qty_ordered: number;
}

interface OrderProductListProps {
  products: Product[];
  productStock: Record<string, number>;
  orderItems: OrderItem[];
  onAddItem: (productId: string) => void;
  onRemoveItem: (idx: number) => void;
  onItemChange: (idx: number, field: "product_id" | "qty_ordered", value: string | number) => void;
}

function getProductImageUrl(imageFilename?: string) {
  if (!imageFilename) return "/placeholder.svg";
  if (imageFilename.startsWith("http")) return imageFilename;
  return `/uploads/${imageFilename}`;
}

export function OrderProductList({
  products,
  productStock,
  orderItems,
  onAddItem,
  onRemoveItem,
  onItemChange,
}: OrderProductListProps) {
  const [search, setSearch] = useState("");
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const query = search.toLowerCase();
  const isSearching = search.trim() !== "";

  const matchesSearch = (product: Product) =>
    product.name.toLowerCase().includes(query) ||
    Boolean(product.sku && product.sku.toLowerCase().includes(query));
  const isInStock = (product: Product) => (productStock[product.id] ?? 0) > 0;
  const isInOrder = (product: Product) => orderItems.some((item) => item.product_id === product.id);
  const hiddenOutOfStockCount = products.filter((product) => !isInStock(product) && !isInOrder(product)).length;

  const visibleProducts = products.filter((product) => {
    if (!matchesSearch(product)) return false;
    return isSearching || showOutOfStock || isInOrder(product) || isInStock(product);
  });

  return (
    <div className="space-y-4">
      <Input
        type="text"
        placeholder="Search by product name or SKU…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
      />

      {!isSearching && hiddenOutOfStockCount > 0 && (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowOutOfStock((current) => !current)}>
          {showOutOfStock ? "Hide out-of-stock items" : `Show out-of-stock items (${hiddenOutOfStockCount})`}
        </Button>
      )}

      <ul className="divide-y divide-border">
        {visibleProducts.map((product) => {
          const stock = productStock[product.id] ?? 0;
          const isOutOfStock = stock === 0;
          const itemIdx = orderItems.findIndex((item) => item.product_id === product.id);
          const item = orderItems[itemIdx];

          return (
            <li key={product.id} className="flex items-center gap-3 py-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                <img
                  src={getProductImageUrl(product.image_filename)}
                  alt={product.name}
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.src = "/placeholder.svg";
                  }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">SKU: {product.sku || "—"}</p>
                <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
                <p className="text-sm font-bold text-accent-2">₱{product.price}</p>
                <p className={cn("text-xs", isOutOfStock ? "text-destructive" : "text-muted-foreground")}>
                  {isOutOfStock ? "Out of stock" : `${stock} available`}
                </p>
              </div>

              {item ? (
                <div className="flex shrink-0 items-center gap-2">
                  <QuantityStepper
                    value={item.qty_ordered}
                    min={1}
                    max={stock}
                    onChange={(qty) => onItemChange(itemIdx, "qty_ordered", qty)}
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveItem(itemIdx)}
                    aria-label="Remove item"
                    className="p-2 text-destructive hover:bg-destructive-soft rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isOutOfStock}
                  onClick={() => onAddItem(product.id)}
                  className="shrink-0 px-4 py-2 rounded-full border border-accent-2 text-accent-2 text-xs font-semibold whitespace-nowrap disabled:opacity-40"
                >
                  Add
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {visibleProducts.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground text-sm">No products found matching "{search}"</p>
        </div>
      )}
    </div>
  );
}
