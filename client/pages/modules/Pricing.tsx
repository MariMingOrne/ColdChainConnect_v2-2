import { PageDialog } from "@/components/shared/PageDialog";
import { StatCard } from "@/components/shared/StatCard";
import { Archive, ArchiveRestore, Tag, Wallet } from "lucide-react";
import { toast } from "sonner";
import { confirmAction } from "@/lib/confirm";
import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useCan } from "@/hooks/useCan";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useInventoryContext } from "../../context/InventoryContext";
import { SortableHeader, SortState, compareNewestFirst, compareValues } from "@/components/SortableHeader";
import { Table } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRODUCT_UNITS, marginPercent, markupPercent, type Product, type ProductUnit } from "@shared/api";
import { NativeSelect } from "@/components/ui/native-select";
import { ExcelActionsDropdown } from "@/components/ExcelActionsDropdown";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { TableBulkAction, TableFilterSelect, TableToolbar } from "@/components/TableToolbar";
import { ExcelImportDialog } from "@/components/ExcelImportDialog";
import { ExcelColumn, exportExcelFile } from "@/lib/excel";
import { RecordDetailsDialog, type RecordDetails } from "@/components/RecordDetailsDialog";
import { RecordTitleButton } from "@/components/RecordTitleButton";

interface PricingProps {
  onBack?: () => void;
}

interface ProductForm {
  name: string;
  sku?: string;
  price: string;
  image_filename?: string;
  manufacturer?: string;
  is_discontinued: boolean;
  reorder_point?: number;
  weight?: number;
  unit: ProductUnit;
  /** null clears the value on save. */
  srp?: number | null;
  cost_price?: number | null;
}

const productExcelColumns: ExcelColumn[] = [
  { header: "Name", key: "name", required: true, width: 30 },
  { header: "SKU", key: "sku", width: 18 },
  { header: "Price", key: "price", required: true, width: 14 },
  { header: "Reorder Point", key: "reorder_point", width: 16 },
  { header: "Manufacturer", key: "manufacturer", width: 28 },
  { header: "Discontinued", key: "is_discontinued", width: 16 },
  { header: "Batch Tracking", key: "batch_tracking_enabled", width: 16 },
];


function ProductPage({
  title,
  formData,
  setFormData,
  canSeeCost,
  onClose,
  onSave,
}: {
  title: string;
  canSeeCost: boolean;
  formData: ProductForm;
  setFormData: (data: ProductForm) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const formDataUpload = new FormData();
    formDataUpload.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${useAuth.getState().token ?? ""}` },
        body: formDataUpload,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Upload failed");
      setFormData({ ...formData, image_filename: data.filename });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className="mx-auto w-full !max-w-xl flex-1 p-6 overflow-y-auto scrollbar-visible space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
        </div>
      </div>
      <div className="bg-card rounded-2xl border border-border max-w-lg w-full">

        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="pricing-product-name" className="block text-xs font-semibold text-foreground mb-1">Product Name *</label>
            <Input id="pricing-product-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
              placeholder="e.g., Chicken Breast"
            />
          </div>

          <div>
            <label htmlFor="pricing-sku-code" className="block text-xs font-semibold text-foreground mb-1">SKU Code</label>
            <Input id="pricing-sku-code"
              type="text"
              value={formData.sku || ""}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
              placeholder="e.g., 7700165"
            />
          </div>

          <div>
            <label htmlFor="pricing-unit-price" className="block text-xs font-semibold text-foreground mb-1">Unit Price (₱) *</label>
            <Input id="pricing-unit-price"
              type="number"
              step="0.01"
              min="0"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-2">Product Image</label>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploadingImage}
                className="flex-1 text-sm text-muted-foreground file:px-3 file:py-2 file:border file:border-border file:rounded-lg file:bg-card file:text-foreground file:cursor-pointer hover:file:bg-muted"
              />
              {uploadingImage && <span className="text-xs text-muted-foreground">Uploading...</span>}
            </div>
            {formData.image_filename && (
              <div className="mt-2 text-xs text-success">✓ {formData.image_filename}</div>
            )}
          </div>

          <div>
            <label htmlFor="pricing-manufacturer" className="block text-xs font-semibold text-foreground mb-1">Manufacturer</label>
            <Input id="pricing-manufacturer"
              type="text"
              value={formData.manufacturer || ""}
              onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
              placeholder="e.g., Frabelle Food Corp"
            />
          </div>

          <div>
            <label htmlFor="pricing-reorder-level" className="block text-xs font-semibold text-foreground mb-1">Reorder Level</label>
            <Input id="pricing-reorder-level"
              type="number"
              min="0"
              value={formData.reorder_point || ""}
              onChange={(e) => setFormData({ ...formData, reorder_point: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
              placeholder="e.g., 300"
            />
            <p className="text-xs text-muted-foreground mt-1">Stock level at which inventory shows as needing reorder.</p>
          </div>

          <div>
            <label htmlFor="pricing-unit" className="block text-xs font-semibold text-foreground mb-1">Unit type</label>
            <NativeSelect id="pricing-unit" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value as ProductUnit })}>
              {PRODUCT_UNITS.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground mt-1">Printed in the UNIT column of the receipt.</p>
          </div>

          <div>
            <label htmlFor="pricing-weight-kg" className="block text-xs font-semibold text-foreground mb-1">Weight (kg)</label>
            <Input id="pricing-weight-kg"
              type="number"
              min="0"
              step="0.01"
              value={formData.weight ?? ""}
              onChange={(e) => setFormData({ ...formData, weight: e.target.value === "" ? undefined : Number(e.target.value) })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
              placeholder="e.g., 25"
            />
          </div>

          <div>
            <label htmlFor="pricing-srp" className="block text-xs font-semibold text-foreground mb-1">SRP — suggested retail price (₱)</label>
            <Input id="pricing-srp"
              type="number"
              step="0.01"
              min="0"
              value={formData.srp ?? ""}
              onChange={(e) => setFormData({ ...formData, srp: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="Leave empty if there is none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {markupPercent(formData.price, formData.srp) === null
                ? "Markup shows once the unit price and SRP are set."
                : `Customer markup: ${markupPercent(formData.price, formData.srp)}% over your unit price.`}
            </p>
          </div>

          {canSeeCost && (
            <div>
              <label htmlFor="pricing-cost" className="block text-xs font-semibold text-foreground mb-1">Cost price (₱)</label>
              <Input id="pricing-cost"
                type="number"
                step="0.01"
                min="0"
                value={formData.cost_price ?? ""}
                onChange={(e) => setFormData({ ...formData, cost_price: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="What one unit costs you"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {marginPercent(formData.price, formData.cost_price) === null
                  ? "Profit margin shows once the unit price and cost are set. Only admins can see cost."
                  : `Profit margin: ${marginPercent(formData.price, formData.cost_price)}% of your unit price.`}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Input
              type="checkbox"
              id="is_discontinued"
              checked={formData.is_discontinued}
              onChange={(e) => setFormData({ ...formData, is_discontinued: e.target.checked })}
              className="w-4 h-4 accent-navy"
            />
            <label htmlFor="is_discontinued" className="text-sm font-semibold text-foreground">
              Mark as Discontinued
            </label>
          </div>
        </div>

        <div className="sticky bottom-0 bg-muted px-6 py-4 flex justify-end gap-2 border-t border-border rounded-b-2xl">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="accent" onClick={onSave}>Save Product</Button>
        </div>
      </div>
    </div>
  );
}

function ViewProductPage({ product, cost, canSeeCost, onClose }: { product: Product; cost: string | undefined; canSeeCost: boolean; onClose: () => void }) {
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Product Details</h1>
        </div>
      </div>
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-card">
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:p-6">
          {product.image_filename && (
            <div className="rounded-lg bg-muted p-4 text-center sm:col-span-2">
              <img src={`/uploads/${product.image_filename}`} alt={product.name} className="mx-auto max-h-64 h-auto max-w-full" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Product Name</label>
            <div className="text-sm font-semibold text-foreground">{product.name}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">SKU Code</label>
            <div className="text-sm text-foreground">{product.sku || "—"}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Unit Price</label>
            <div className="text-sm font-semibold text-foreground">₱{parseFloat(product.price ?? "0").toLocaleString("en-PH", { minimumFractionDigits: 2 })}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Unit Type</label>
            <div className="text-sm text-foreground">{product.unit ?? "PK"}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">SRP</label>
            <div className="text-sm text-foreground">
              {product.srp == null ? "—" : `₱${parseFloat(product.srp).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
              {markupPercent(product.price, product.srp) !== null && (
                <span className="ml-2 text-xs text-muted-foreground">({markupPercent(product.price, product.srp)}% markup)</span>
              )}
            </div>
          </div>
          {canSeeCost && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Cost Price</label>
              <div className="text-sm text-foreground">
                {cost == null ? "—" : `₱${parseFloat(cost).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
                {marginPercent(product.price, cost) !== null && (
                  <span className="ml-2 text-xs text-muted-foreground">({marginPercent(product.price, cost)}% margin)</span>
                )}
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Weight</label>
            <div className="text-sm text-foreground">{product.weight == null ? "—" : `${product.weight} kg`}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Reorder Level</label>
            <div className="text-sm text-foreground">{product.reorder_point ?? "—"}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Manufacturer</label>
            <div className="text-sm text-foreground">{product.manufacturer || "—"}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Batch Tracking</label>
            <div className="text-sm"><span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${product.batch_tracking_enabled ? "badge-green" : "badge-red"}`}>{product.batch_tracking_enabled ? "Enabled" : "Disabled"}</span></div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Discontinued</label>
            <div className="text-sm"><span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${(product.is_discontinued ?? false) ? "badge-red" : "badge-green"}`}>{product.is_discontinued ? "Yes" : "No"}</span></div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Archived</label>
            <div className="text-sm"><span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${product.is_archived ? "badge-red" : "badge-green"}`}>{product.is_archived ? "Yes" : "No"}</span></div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Created</label>
            <div className="text-sm text-foreground">{new Date(product.created_at).toLocaleDateString()}</div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Last Updated</label>
            <div className="text-sm text-foreground">{new Date(product.updated_at).toLocaleDateString()}</div>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end border-t border-border rounded-b-2xl bg-muted px-4 py-3 md:px-6">
          <Button onClick={onClose} variant="default">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function ImagePreviewPage({ filename, onClose }: { filename: string; onClose: () => void }) {
  return (
    <div className="flex-1 p-6 overflow-y-auto scrollbar-visible space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Image Preview</h1>
        </div>
      </div>
      <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-6">
        <img src={`/uploads/${filename}`} alt="Preview" className="max-w-full max-h-[60vh] object-contain" />
      </div>
    </div>
  );
}

export function Pricing({ onBack }: PricingProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Shared with Inventory via context
  const { searchQuery, setSearchQuery } = useInventoryContext();
  const [currentPage, setCurrentPage] = useState(1);
  const [productSort, setProductSort] = useState<SortState<"image" | "name" | "price" | "reorder" | "weight" | "status">>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productStatusFilter, setProductStatusFilter] = useState("all");
  const [manufacturerFilter, setManufacturerFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [productDetails, setProductDetails] = useState<RecordDetails | null>(null);
  const [previewImageFilename, setPreviewImageFilename] = useState<string | null>(null);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [formData, setFormData] = useState<ProductForm>({
    name: "",
    sku: "",
    price: "",
    image_filename: "",
    manufacturer: "",
    is_discontinued: false,
    reorder_point: 0,
    weight: undefined,
    unit: "PK",
    srp: null,
    cost_price: null,
  });
  const [costs, setCosts] = useState<Record<string, string>>({});
  const { token } = useAuth();
  const canManageProducts = useCan("product:manage");

  const itemsPerPage = 10;

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/products?include_archived=true", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = await response.json();
      setProducts(data);
      if (canManageProducts) {
        const costResponse = await fetch("/api/product-costs", { headers: { Authorization: `Bearer ${token}` } });
        if (costResponse.ok) setCosts(await costResponse.json());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading products");
    } finally {
      setIsLoading(false);
    }
  };

  const validateProductImportRow = (row: Record<string, unknown>) => {
    const name = String(row.name ?? "").trim();
    const price = Number(row.price);
    const sku = String(row.sku ?? "").trim();
    const issues = [];
    if (!name) issues.push("Name is required");
    if (!Number.isFinite(price) || price <= 0) issues.push("Price must be greater than zero");
    if (products.some((product) => product.name.toLowerCase() === name.toLowerCase() || (sku && product.sku?.toLowerCase() === sku.toLowerCase()))) {
      issues.push("Name or SKU already exists");
    }
    return issues;
  };

  const importProductRows = async (rows: Record<string, unknown>[]) => {
    const response = await fetch("/api/products/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rows }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Product import failed.");
    await fetchProducts();
  };

  const handleProductExport = async () => {
    await exportExcelFile("products.xlsx", "Products", productExcelColumns, activeProducts.map((product) => ({
      name: product.name,
      sku: product.sku ?? "",
      price: Number(product.price),
      reorder_point: product.reorder_point ?? 0,
      weight: product.weight != null ? Number(product.weight) : undefined,
      manufacturer: product.manufacturer ?? "",
      is_discontinued: product.is_discontinued ?? false,
      batch_tracking_enabled: product.batch_tracking_enabled,
    })));
  };

  useEffect(() => {
    if (token) {
      fetchProducts();
    }
  }, [token]);
  useAutoRefresh(fetchProducts, { enabled: Boolean(token) });

  const activeProducts = products.filter((product) => !product.is_archived);
  const archivedCount = products.length - activeProducts.length;
  const manufacturers = Array.from(new Set(products.map((product) => product.manufacturer).filter((manufacturer): manufacturer is string => Boolean(manufacturer)))).sort();
  const filteredProducts = products.filter((product) =>
    (product.name?.toLowerCase().includes(searchQuery.toLowerCase()) || product.sku?.toLowerCase().includes(searchQuery.toLowerCase())) &&
    Boolean(product.is_archived) === showArchived &&
    (productStatusFilter === "all" || (productStatusFilter === "active" ? !product.is_discontinued : product.is_discontinued)) &&
    (manufacturerFilter === "all" || product.manufacturer === manufacturerFilter)
  );

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!productSort) return compareNewestFirst(a, b);
    const direction = productSort.direction === "asc" ? 1 : -1;
    const value = (p: Product) =>
      productSort.key === "image" ? p.image_filename
      : productSort.key === "name" ? p.name
      : productSort.key === "price" ? Number(p.price)
      : productSort.key === "reorder" ? Number(p.reorder_point)
      : productSort.key === "weight" ? Number(p.weight)
      : p.is_discontinued ? "Discontinued" : "Active";
    return compareValues(value(a), value(b)) * direction;
  });

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = sortedProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const selectedProducts = products.filter((product) => selectedProductIds.includes(product.id));

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({ name: "", sku: "", price: "", image_filename: "", manufacturer: "", is_discontinued: false, reorder_point: 0, weight: undefined, unit: "PK", srp: null, cost_price: null });
    setIsModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku ?? "",
      price: product.price?.toString() ?? "",
      image_filename: product.image_filename ?? "",
      manufacturer: (product as any).manufacturer ?? "",
      is_discontinued: (product as any).is_discontinued ?? false,
      reorder_point: (product as any).reorder_point ?? 0,
      weight: product.weight != null ? Number(product.weight) : undefined,
      unit: product.unit ?? "PK",
      srp: product.srp != null ? Number(product.srp) : null,
      cost_price: costs[product.id] != null ? Number(costs[product.id]) : null,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.price) return;
    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : "/api/products";
      const method = editingProduct ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error("Failed to save product");
      const saved = await response.json();
      if (canManageProducts) {
        setCosts((current) => {
          const next = { ...current };
          if (formData.cost_price == null) delete next[saved.id];
          else next[saved.id] = formData.cost_price.toFixed(2);
          return next;
        });
      }
      if (editingProduct) {
        setProducts(products.map((p) => (p.id === saved.id ? saved : p)));
      } else {
        setProducts((current) => [saved, ...current]);
      }
      setIsModalOpen(false);
    } catch (err) {
      toast.error("Failed to save product");
    }
  };

  const setSelectedArchived = async (archived: boolean) => {
    if (selectedProducts.length === 0) return;
    const noun = selectedProducts.length === 1 ? "product" : "products";
    const prompt = archived
      ? `Archive ${selectedProducts.length} selected ${noun}? They will be hidden from the product list until restored.`
      : `Restore ${selectedProducts.length} selected ${noun}?`;
    if (!(await confirmAction(prompt))) return;
    const selectedIds = selectedProducts.map((product) => product.id);
    try {
      const responses = await Promise.all(selectedIds.map((id) => fetch(`/api/products/${id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_archived: archived }),
      })));
      const failedCount = responses.filter((response) => !response.ok).length;
      await fetchProducts();
      setSelectedProductIds([]);
      if (failedCount > 0) {
        toast.error(`${failedCount} of ${selectedIds.length} ${noun} could not be ${archived ? "archived" : "restored"}`);
      } else {
        toast.success(`${selectedIds.length} ${noun} ${archived ? "archived" : "restored"}`);
      }
    } catch {
      toast.error(`Failed to ${archived ? "archive" : "restore"} selected products`);
    }
  };

  const setSelectedDiscontinued = async () => {
    if (selectedProducts.length === 0) return;
    const noun = selectedProducts.length === 1 ? "product" : "products";
    if (!(await confirmAction(`Mark ${selectedProducts.length} selected ${noun} as discontinued?`))) return;
    const selectedIds = selectedProducts.map((product) => product.id);
    try {
      const responses = await Promise.all(selectedIds.map((id) => fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_discontinued: true }),
      })));
      const failedCount = responses.filter((response) => !response.ok).length;
      await fetchProducts();
      setSelectedProductIds([]);
      if (failedCount > 0) {
        toast.error(`${failedCount} of ${selectedIds.length} ${noun} could not be marked as discontinued`);
      } else {
        toast.success(`${selectedIds.length} ${noun} marked as discontinued`);
      }
    } catch {
      toast.error("Failed to mark selected products as discontinued");
    }
  };

  const totalValue = activeProducts.reduce((sum, p) => sum + parseFloat(p.price ?? "0"), 0);
  const avgPrice = activeProducts.length > 0 ? totalValue / activeProducts.length : 0;

  const productBulkActions: TableBulkAction[] = [
    ...(selectedProducts.length === 1
      ? [
          { label: "View product", onSelect: () => setViewingProduct(selectedProducts[0]) },
          ...(canManageProducts ? [{ label: "Edit product", onSelect: () => openEditModal(selectedProducts[0]) }] : []),
        ]
      : []),
    ...(canManageProducts
      ? [showArchived
          ? { label: `Restore selected ${selectedProducts.length === 1 ? "product" : "products"}`, onSelect: () => void setSelectedArchived(false) }
          : { label: `Archive selected ${selectedProducts.length === 1 ? "product" : "products"}`, onSelect: () => void setSelectedArchived(true) }]
      : []),
    ...(canManageProducts
      ? [{ label: `Mark selected ${selectedProducts.length === 1 ? "product" : "products"} as discontinued`, onSelect: () => void setSelectedDiscontinued() }]
      : []),
  ];

  if (isLoading) {
    return (
      <div className="flex-1 px-4 md:px-6 lg:px-7 py-4 md:py-6 space-y-6">
        <LoadingSpinner className="min-h-64" />
      </div>
    );
  }









  return (
    <>

    <div className="flex-1 flex flex-col gap-6 p-6 overflow-y-auto scrollbar-visible">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">Manage your products</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageProducts && (
            <Button
              onClick={openAddModal}
              variant="default"
            >
              Add Product
            </Button>
          )}
          <ExcelActionsDropdown
            onImport={canManageProducts ? () => setShowExcelImport(true) : undefined}
            onExport={handleProductExport}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => { setShowArchived((current) => !current); setSelectedProductIds([]); setCurrentPage(1); }}
          >
            {showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            {showArchived ? "Active Products" : `Archived Items (${archivedCount})`}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red/10 border border-red/30 text-red rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
        <StatCard label="Total Products" value={activeProducts.length.toString()} icon={Tag} />
        <StatCard
          label="Avg Price"
          value={`₱${avgPrice.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`} icon={Wallet}
        />
      </div>

      <TableToolbar
        selectedCount={selectedProducts.length}
        bulkActions={productBulkActions}
        searchValue={searchQuery}
        onSearchChange={(value) => { setSearchQuery(value); setCurrentPage(1); }}
        searchPlaceholder="Search by product name or SKU…"
      >
        <TableFilterSelect label="Filter products by status" value={productStatusFilter} onChange={(value) => { setProductStatusFilter(value); setCurrentPage(1); }}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="discontinued">Discontinued</option>
        </TableFilterSelect>
        <TableFilterSelect label="Filter products by manufacturer" value={manufacturerFilter} onChange={(value) => { setManufacturerFilter(value); setCurrentPage(1); }}>
          <option value="all">All manufacturers</option>
          {manufacturers.map((manufacturer) => <option key={manufacturer} value={manufacturer}>{manufacturer}</option>)}
        </TableFilterSelect>
      </TableToolbar>

      {/* Table */}
      <div className="data-table-frame overflow-hidden">
        <div className="overflow-x-auto scrollbar-visible">
          <Table>
            <thead>
              <tr>
                <th className="px-3 py-3"><Input aria-label="Select all products on this page" type="checkbox" checked={paginatedProducts.length > 0 && paginatedProducts.every((product) => selectedProductIds.includes(product.id))} onChange={(event) => setSelectedProductIds(event.target.checked ? Array.from(new Set([...selectedProductIds, ...paginatedProducts.map((product) => product.id)])) : selectedProductIds.filter((id) => !paginatedProducts.some((product) => product.id === id)))} /></th>
                <SortableHeader label="Image" sortKey="image" sort={productSort} onSort={setProductSort} />
                <SortableHeader label="Product Name" sortKey="name" sort={productSort} onSort={setProductSort} />
                <SortableHeader label="Unit Price" sortKey="price" sort={productSort} onSort={setProductSort} />
                <SortableHeader label="Reorder Level" sortKey="reorder" sort={productSort} onSort={setProductSort} />
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Unit type</th>
                <SortableHeader label="Weight" sortKey="weight" sort={productSort} onSort={setProductSort} />
                <SortableHeader label="Status" sortKey="status" sort={productSort} onSort={setProductSort} className="hidden md:table-cell" />
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    {showArchived ? "No archived products found" : activeProducts.length === 0 ? "No products found" : "No results matching your search"}
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((product) => (
                  <tr key={product.id} className="border-b border-border hover:bg-accent/50 transition-colors">
                    <td className="px-3 py-3"><Input aria-label={`Select ${product.name}`} type="checkbox" checked={selectedProductIds.includes(product.id)} onChange={(event) => setSelectedProductIds(event.target.checked ? [...selectedProductIds, product.id] : selectedProductIds.filter((id) => id !== product.id))} /></td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {product.image_filename ? (
                        <div className="w-10 h-10 bg-muted rounded-lg overflow-hidden border border-border flex items-center justify-center cursor-pointer hover:border-accent-2 hover:shadow-md transition duration-200 hover:scale-110" onClick={() => setPreviewImageFilename(product.image_filename)}>
                          <img src={`/uploads/${product.image_filename}`} alt={product.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 bg-muted rounded-lg border border-border flex items-center justify-center text-muted-foreground text-xs">
                          —
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-foreground font-semibold">
                      <RecordTitleButton
                        onClick={() =>
                          setProductDetails({
                            title: product.name,
                            subtitle: "Product details",
                            fields: [
                              { label: "SKU", value: product.sku || "—" },
                              { label: "Unit Price", value: `₱${parseFloat(product.price ?? "0").toLocaleString("en-PH", { minimumFractionDigits: 2 })}` },
                              { label: "Reorder Level", value: product.reorder_point?.toLocaleString() || "—" },
                              { label: "Unit type", value: product.unit ?? "PK" },
                              { label: "Weight", value: product.weight != null ? `${Number(product.weight).toLocaleString()} kg` : "—" },
                              { label: "Status", value: product.is_discontinued ? "Discontinued" : "Active" },
                              { label: "Manufacturer", value: product.manufacturer || "—" },
                              { label: "Batch Tracking", value: product.batch_tracking_enabled ? "Enabled" : "Disabled" },
                            ],
                          })
                        }
                      >
                        {product.name}
                      </RecordTitleButton>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="stock-val stock-ok">
                        ₱{parseFloat(product.price ?? "0").toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap font-semibold text-foreground">
                      {product.reorder_point?.toLocaleString() || "—"}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-foreground">
                      {product.unit ?? "PK"}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-foreground">
                      {product.weight != null ? `${Number(product.weight).toLocaleString()} kg` : "—"}
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${product.is_discontinued ? "bg-destructive-soft text-destructive" : "bg-success-soft text-success"}`}>
                        {product.is_discontinued ? "Discontinued" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>

        {/* Pagination - Always Display */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/50">
          <div className="text-xs text-muted-foreground">
            Page {currentPage} of {Math.max(1, totalPages)} · {filteredProducts.length} {showArchived ? "archived " : ""}products
          </div>
          <div className="flex gap-2 items-center">
            <Button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              variant="outline" size="sm"
            >
              Previous
            </Button>
            <span className="px-3 py-1 text-xs font-semibold text-foreground bg-card rounded border border-border">
              {currentPage}
            </span>
            <Button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              variant="outline" size="sm"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

    </div>
  
      {(isModalOpen) && (
        <PageDialog onClose={() => setIsModalOpen(false)}>
<ProductPage
        title={editingProduct ? "Edit Product" : "Add New Product"}
        formData={formData}
        setFormData={setFormData}
        canSeeCost={canManageProducts}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
      />
        </PageDialog>
      )}
      {(viewingProduct) && (
        <PageDialog onClose={() => setViewingProduct(null)}>
<ViewProductPage product={viewingProduct} cost={costs[viewingProduct.id]} canSeeCost={canManageProducts} onClose={() => setViewingProduct(null)} />
        </PageDialog>
      )}
      {(productDetails) && (
        <PageDialog onClose={() => setProductDetails(null)}>
<RecordDetailsDialog details={productDetails} onClose={() => setProductDetails(null)} />
        </PageDialog>
      )}
      {(showExcelImport) && (
        <PageDialog onClose={() => setShowExcelImport(false)}>
<ExcelImportDialog
        title="Products"
        columns={productExcelColumns}
        validateRow={validateProductImportRow}
        onImport={importProductRows}
        onClose={() => setShowExcelImport(false)}
      />
        </PageDialog>
      )}
      {(previewImageFilename) && (
        <PageDialog onClose={() => setPreviewImageFilename(null)}>
<ImagePreviewPage filename={previewImageFilename} onClose={() => setPreviewImageFilename(null)} />
        </PageDialog>
      )}
    </>
  );
}
