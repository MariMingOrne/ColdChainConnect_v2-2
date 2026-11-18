import { Trash2 } from "lucide-react";
import { Product } from "@shared/api";
import { QuantityStepper } from "./QuantityStepper";

interface OrderItem {
  product_id: string;
  qty_ordered: number;
}

function getProductImageUrl(imageFilename?: string) {
  if (!imageFilename) return "/placeholder.svg";
  if (imageFilename.startsWith("http")) return imageFilename;
  return `/uploads/${imageFilename}`;
}

interface AgentProductPickerProps {
  products: Product[];
  productStock: Record<string, number>;
  orderItems: OrderItem[];
  onAddItem: (productId: string) => void;
  onRemoveItem: (idx: number) => void;
  onItemChange: (idx: number, field: "product_id" | "qty_ordered", value: string | number) => void;
}

export function AgentProductPicker({
  products,
  productStock,
  orderItems,
  onAddItem,
  onRemoveItem,
  onItemChange,
}: AgentProductPickerProps) {
  return (
    <ul className="divide-y divide-border">
      {products.map((product) => {
        const stock = productStock[product.id] ?? 0;
        const isOutOfStock = stock === 0;
        const itemIdx = orderItems.findIndex((item) => item.product_id === product.id);
        const selectedItem = itemIdx !== -1 ? orderItems[itemIdx] : undefined;

        return (
          <li key={product.id} className="flex items-center gap-2 py-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-off-white">
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
              <p className="text-[11px] text-muted">SKU: {product.sku || "—"}</p>
              <p className="text-sm font-semibold text-navy truncate">{product.name}</p>
              <p className="text-sm font-bold text-accent-2">₱{product.price}</p>
              {isOutOfStock ? (
                <p className="text-xs text-red-600">Out of stock</p>
              ) : (
                <p className="text-xs text-muted">{stock} available</p>
              )}
            </div>
            {selectedItem ? (
              <div className="flex shrink-0 items-center gap-2">
                <QuantityStepper
                  value={selectedItem.qty_ordered}
                  min={1}
                  max={stock}
                  onChange={(qty) => onItemChange(itemIdx, "qty_ordered", qty)}
                />
                <button
                  type="button"
                  onClick={() => onRemoveItem(itemIdx)}
                  aria-label="Remove item"
                  className="p-2 text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isOutOfStock}
                onClick={() => onAddItem(product.id)}
                className="shrink-0 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap border border-accent-2 text-accent-2 disabled:opacity-40"
              >
                Add
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
