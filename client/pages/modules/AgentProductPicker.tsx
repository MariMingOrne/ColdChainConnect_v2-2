import { Button } from "@/components/ui/button";
import { Product } from "@shared/api";

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
}

export function AgentProductPicker({
  products,
  productStock,
  orderItems,
  onAddItem,
  onRemoveItem,
}: AgentProductPickerProps) {
  return (
    <ul className="divide-y divide-border">
      {products.map((product) => {
        const stock = productStock[product.id] ?? 0;
        const isOutOfStock = stock === 0;
        const itemIdx = orderItems.findIndex((item) => item.product_id === product.id);
        const isAdded = itemIdx !== -1;

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
              {isOutOfStock && <p className="text-xs text-destructive">Out of stock</p>}
            </div>
            <Button
              type="button"
              disabled={isOutOfStock && !isAdded}
              onClick={() => (isAdded ? onRemoveItem(itemIdx) : onAddItem(product.id))} variant={isAdded ? "default" : "outline"} size="sm" className="rounded-full px-4 text-xs disabled:opacity-40">
              {isAdded ? "✓ Added" : "Add"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
