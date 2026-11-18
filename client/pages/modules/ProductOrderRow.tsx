import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Product } from "@shared/api";
import { QuantityStepper } from "./QuantityStepper";

interface ProductOrderRowProps {
  product: Product;
  imageUrl: string;
  stock: number;
  selectedQty?: number;
  onAdd: () => void;
  onRemove: () => void;
  onQuantityChange: (qty: number) => void;
}

export function ProductOrderRow({
  product,
  imageUrl,
  stock,
  selectedQty,
  onAdd,
  onRemove,
  onQuantityChange,
}: ProductOrderRowProps) {
  const isSelected = selectedQty !== undefined;
  const isOutOfStock = stock === 0;

  return (
    <div
      className={`flex items-center gap-3 p-4 rounded-lg border transition ${
        isSelected ? "border-accent-2 bg-blue-50" : "border-border bg-white"
      } ${isOutOfStock && !isSelected ? "opacity-60" : ""}`}
    >
      <img
        src={imageUrl}
        alt={product.name}
        className="w-16 h-16 flex-shrink-0 object-cover rounded"
        onError={(e) => {
          (e.target as HTMLImageElement).src = "/placeholder.svg";
        }}
      />
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-sm text-navy mb-1">{product.name}</h4>
        <div className="flex items-center gap-3">
          <p className="text-sm font-bold text-accent-2">₱{product.price}</p>
          <span
            className={`px-2 py-1 rounded text-xs font-semibold ${
              isOutOfStock
                ? "bg-red-200 text-red-700"
                : stock < 10
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-green-100 text-green-800"
            }`}
          >
            {isOutOfStock ? "Out of Stock" : `${stock} available`}
          </span>
        </div>
      </div>
      {isSelected ? (
        <div className="flex items-center gap-2">
          <QuantityStepper value={selectedQty} min={1} max={stock} onChange={onQuantityChange} />
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove item"
            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : (
        <Button type="button" variant="accent" size="sm" onClick={onAdd} disabled={isOutOfStock}>
          <Plus size={14} />
          Add
        </Button>
      )}
    </div>
  );
}
