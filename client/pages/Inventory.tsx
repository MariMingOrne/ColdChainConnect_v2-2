import { formatPeso } from "@/lib/utils";
import { StatCard } from "@/components/shared/StatCard";
import { Package, TriangleAlert, Hash, Wallet } from "lucide-react";
import { toast } from "sonner";
import { confirmAction } from "@/lib/confirm";
import { useState, useEffect } from "react";
import { useInventoryContext } from "../context/InventoryContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import { ExcelActionsDropdown } from "@/components/ExcelActionsDropdown";
import { ActionButtons } from "@/components/ActionButtons";
import { ExcelImportDialog } from "@/components/ExcelImportDialog";
import { ExcelColumn, exportExcelFile } from "@/lib/excel";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { Table } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SortableHeader, SortState, compareValues } from "@/components/SortableHeader";

interface InventoryProduct {
  id: string;
  sku: string;
  description: string;
  unitPrice: number;
  supplierId: string;
  weight: number;
  quantity: number;
  expiryDate: string;
  imageFilename?: string;
  reorderPoint: number;
  lastUpdated: string;
  createdAt: string;
  manufacturer: string;
  isDiscontinued: boolean;
}

const inventoryExcelColumns: ExcelColumn[] = [
  { header: "Batch Name", key: "batch_name", required: true, width: 24 },
  { header: "Pallet ID", key: "pallet_id", required: true, width: 18 },
  { header: "SKU", key: "sku", required: true, width: 18 },
  { header: "Quantity", key: "quantity", required: true, width: 14 },
  { header: "Expiration Date", key: "expiration_date", width: 20 },
  { header: "Supplier Name", key: "supplier_name", width: 24 },
  { header: "Received Date", key: "received_date", width: 16 },
  { header: "Storage Zone", key: "storage_zone", width: 18 },
  { header: "Placement Location", key: "placement_location", width: 22 },
];

const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

interface PalletDisplay {
  id: string;
  palletId: string;
  itemCount: number;
  totalQty: number;
}

export function Inventory() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const { batches, setBatches, selectedBatchId, setSelectedBatchId, selectedPalletId, setSelectedPalletId, searchQuery, setSearchQuery, refreshBatchesFromDB } = useInventoryContext();
  const [currentPage, setCurrentPage] = useState(1);
  const [extraInfoProduct, setExtraInfoProduct] = useState<(InventoryProduct & { batchQuantity: number }) | null>(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [newBatchName, setNewBatchName] = useState("");
  const [startBatchCreation, setStartBatchCreation] = useState(false);
  const [batchSearch, setBatchSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [expiryFilter, setExpiryFilter] = useState("all");
  const [batchCreatedSince, setBatchCreatedSince] = useState("");
  const [inventorySort, setInventorySort] = useState<SortState<"name" | "cost" | "stock" | "reorder" | "expiry">>(null);
  const [showExcelImport, setShowExcelImport] = useState(false);

  const emptyForm = (): InventoryProduct => ({
    id: "", sku: "", description: "", unitPrice: 0, supplierId: "",
    weight: 0, quantity: 0, expiryDate: "", imageFilename: "",
    reorderPoint: 300, lastUpdated: new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString(), manufacturer: "", isDiscontinued: false,
  });


  useEffect(() => {
    if (searchParams.get("action") !== "receive") return;
    setNewBatchName("");
    setStartBatchCreation(true);
    setIsBatchModalOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("action");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const itemsPerPage = 10;

  const fetchProductsFromApi = async () => {
    try {
      const token = localStorage.getItem("auth_token") || "";
      const headers = { Authorization: `Bearer ${token}` };

      const productsRes = await fetch("/api/products", { headers });
      const productsData = productsRes.ok ? await productsRes.json() : [];

      const qtyMap: Record<string, number> = {};
      for (const batch of batches) {
        for (const pallet of batch.pallets) {
          for (const item of pallet.items) {
            qtyMap[item.productId] = (qtyMap[item.productId] || 0) + item.quantity;
          }
        }
      }

      const mapped: InventoryProduct[] = productsData.map((p: any) => ({
        id: p.id,
        sku: p.sku || p.name,
        description: p.name,
        unitPrice: parseFloat(p.price) || 0,
        supplierId: p.supplier_id || "",
        weight: 0,
        quantity: qtyMap[p.id] ?? 0,
        expiryDate: "",
        imageFilename: p.image_filename,
        reorderPoint: p.reorder_point ?? 300,
        lastUpdated: p.updated_at || new Date().toISOString(),
        createdAt: p.created_at || p.updated_at || new Date().toISOString(),
        manufacturer: p.manufacturer || "",
        isDiscontinued: p.is_discontinued ?? false,
      }));

      setProducts(mapped);
    } catch (err) {
      console.error("Failed to load products:", err);
    }
  };

  useEffect(() => {
    fetchProductsFromApi();
  }, [batches]);

  const currentBatch = batches.find((b) => b.id === selectedBatchId);
  const activeBatches = batches.filter((b) => !b.isArchived && b.id !== "batch-all");
  const batchSearchTerm = batchSearch.trim().toLowerCase();
  const visibleBatches = activeBatches.filter((b) =>
    (!batchSearchTerm || b.name.toLowerCase().includes(batchSearchTerm) || b.pallets.some((p) => p.palletId.toLowerCase().includes(batchSearchTerm))) &&
    (!batchCreatedSince || new Date(b.createdAt) >= new Date(batchCreatedSince))
  );
  const visiblePallets = currentBatch && currentBatch.id !== "batch-all"
    ? currentBatch.pallets.filter((p) => !batchSearchTerm || currentBatch.name.toLowerCase().includes(batchSearchTerm) || p.palletId.toLowerCase().includes(batchSearchTerm))
    : [];
  const selectBatch = (id: string) => { setSelectedBatchId(id); setSelectedPalletId(null); setCurrentPage(1); };
  const selectPallet = (id: string | null) => { setSelectedPalletId(id); setCurrentPage(1); };

  const getBatchProducts = (): (InventoryProduct & { batchQuantity: number; batchExpiryDate: string; itemId?: string })[] => {
    if (!currentBatch || currentBatch.id === "batch-all") {
      return products.map((p) => ({ ...p, batchQuantity: p.quantity, batchExpiryDate: p.expiryDate }));
    }

    const itemsByProduct: Record<string, { quantity: number; expiryDates: string[]; itemId?: string }> = {};
    const scopedPallets = currentBatch.pallets.filter((pallet) => !selectedPalletId || pallet.id === selectedPalletId);
    for (const pallet of scopedPallets) {
      for (const item of pallet.items) {
        if (!itemsByProduct[item.productId]) {
          itemsByProduct[item.productId] = { quantity: 0, expiryDates: [], itemId: item.id };
        }
        itemsByProduct[item.productId].quantity += item.quantity;
        if (item.expirationDate) {
          itemsByProduct[item.productId].expiryDates.push(item.expirationDate);
        }
      }
    }
    return Object.entries(itemsByProduct)
      .map(([productId, { quantity, expiryDates, itemId }]) => {
        const product = products.find((p) => p.id === productId);
        if (!product) return null;
        const earliestExpiry = [...expiryDates].sort()[0] ?? "";
        return {
          ...product,
          batchQuantity: quantity,
          batchExpiryDate: earliestExpiry,
          itemId,
        };
      })
      .filter(Boolean) as (InventoryProduct & { batchQuantity: number; batchExpiryDate: string; itemId?: string })[];
  };

  const batchProducts = getBatchProducts();

  const filteredBatchProducts = batchProducts.filter((p) =>
    (p.sku.toLowerCase().includes(searchQuery.toLowerCase()) || p.description.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (stockFilter === "all" || (stockFilter === "low" ? p.batchQuantity <= p.reorderPoint : p.batchQuantity > p.reorderPoint)) &&
    (expiryFilter === "all" || (expiryFilter === "has-expiry" ? Boolean(p.batchExpiryDate) : !p.batchExpiryDate))
  );

  const sortedBatchProducts = [...filteredBatchProducts].sort((a, b) => {
    if (!inventorySort) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    const direction = inventorySort.direction === "asc" ? 1 : -1;
    const value = (p: typeof a) => ({ name: p.description, cost: p.unitPrice, stock: p.batchQuantity, reorder: p.reorderPoint, expiry: p.batchExpiryDate }[inventorySort.key]);
    return compareValues(value(a), value(b)) * direction;
  });

  const totalPages = Math.ceil(sortedBatchProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedBatchProducts = sortedBatchProducts.slice(startIndex, startIndex + itemsPerPage);

  const suppliers = Array.from(new Set(products.map((p) => p.supplierId))).sort();

  const validateInventoryImportRow = (row: Record<string, unknown>) => {
    const batchName = String(row.batch_name ?? "").trim();
    const palletId = String(row.pallet_id ?? "").trim();
    const sku = String(row.sku ?? "").trim();
    const quantity = Number(row.quantity);
    const issues = [];
    if (!batchName || !palletId || !sku) issues.push("Batch name, pallet ID, and SKU are required");
    if (!Number.isInteger(quantity) || quantity <= 0) issues.push("Quantity must be a positive whole number");
    if (sku && !products.some((product) => product.sku.toLowerCase() === sku.toLowerCase() || product.description.toLowerCase() === sku.toLowerCase())) {
      issues.push("SKU does not match an existing product");
    }
    if (batches.some((batch) => batch.name.toLowerCase() === batchName.toLowerCase() && batch.pallets.some((pallet) => pallet.palletId.toLowerCase() === palletId.toLowerCase()))) {
      issues.push("Pallet already exists in this batch");
    }
    return issues;
  };

  const importInventoryRows = async (rows: Record<string, unknown>[]) => {
    const token = localStorage.getItem("auth_token") || "";
    const response = await fetch("/api/batches/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rows }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Inventory import failed.");
    await refreshBatchesFromDB();
    await fetchProductsFromApi();
  };

  const handleInventoryExport = async () => {
    const stockRows = batches.filter((batch) => batch.id !== "batch-all" && !batch.isArchived).flatMap((batch) => batch.pallets.flatMap((pallet) => pallet.items.map((item) => {
      const product = products.find((entry) => entry.id === item.productId);
      return {
        batch_name: batch.name,
        pallet_id: pallet.palletId,
        sku: product?.sku || product?.description || "",
        quantity: item.quantity,
        expiration_date: item.expirationDate ?? "",
        supplier_name: pallet.supplierName ?? "",
        received_date: pallet.receivedDate ?? "",
        storage_zone: pallet.storageZone ?? "",
        placement_location: pallet.placementLocation ?? "",
      };
    })));
    await exportExcelFile("inventory.xlsx", "Stock", inventoryExcelColumns, stockRows);
  };

  const getReorderStatus = (qty: number, reorderPoint: number) => qty <= reorderPoint ? "RE-ORDER" : "OK";

  const getStockHighlightColor = (qty: number, reorderPoint: number) => {
    if (qty <= reorderPoint) return { bg: "bg-warning-soft", hover: "hover:bg-warning-soft" };
    const percentage = (qty / reorderPoint) * 100;
    if (percentage < 150) return { bg: "bg-warning-soft", hover: "hover:bg-warning-soft" };
    return { bg: "", hover: "hover:bg-accent/50" };
  };

  const getExpiryStatus = (expiryDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = parseIsoDate(expiryDate);
    const daysUntilExpiry = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) return { status: "expired", icon: "Expired", color: { bg: "bg-destructive-soft", hover: "hover:bg-destructive-soft" } };
    if (daysUntilExpiry <= 7) return { status: "almost-expired", icon: "Expires soon", color: { bg: "bg-warning-soft", hover: "hover:bg-warning-soft" } };
    return { status: "ok", icon: "", color: { bg: "", hover: "hover:bg-accent/50" } };
  };

  const getRowHighlightColor = (qty: number, reorderPoint: number, expiryDate?: string) => {
    // Only use expiry status for specific pallet view
    if (selectedBatchId !== "batch-all" && selectedPalletId && expiryDate) {
      return getExpiryStatus(expiryDate).color;
    }
    // Otherwise use stock quantity highlighting
    return getStockHighlightColor(qty, reorderPoint);
  };

  const createNewBatch = async (pallets: any[], batchName: string) => {
    await refreshBatchesFromDB();
    setNewBatchName("");
    setStartBatchCreation(false);
    setIsBatchModalOpen(false);
  };

  const deleteBatch = async (batchId: string) => {
    if (batchId === "batch-all") { toast.error("Cannot delete the default 'All Products' batch"); return; }
    if (!(await confirmAction("Are you sure you want to delete this batch?"))) return;
    const batchName = batches.find((b) => b.id === batchId)?.name;
    if (batchName) {
      try {
        const token = localStorage.getItem("auth_token") || "";
        const res = await fetch("/api/batches", { headers: { Authorization: `Bearer ${token}` } });
        const rows: any[] = res.ok ? await res.json() : [];
        const toDelete = rows.filter((r) => r.batch_name === batchName);
        await Promise.all(toDelete.map((r) =>
          fetch(`/api/batches/${r.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
        ));
      } catch (err) { console.error("Failed to delete batch rows:", err); }
    }
    if (selectedBatchId === batchId) setSelectedBatchId("batch-all");
    await refreshBatchesFromDB();
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction("Are you sure you want to delete this product?"))) return;
    try {
      const token = localStorage.getItem("auth_token") || "";
      const response = await fetch(`/api/products/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Failed to delete");
      setProducts(products.filter((p) => p.id !== id));
      setBatches(batches.map((b) => ({
        ...b,
        pallets: b.pallets.map((p: any) => ({
          ...p,
          items: p.items.filter((i: any) => i.productId !== id),
        })),
      })));
      await fetchProductsFromApi();
    } catch (err) {
      toast.error("Failed to delete product. Please try again.");
    }
  };

  if (extraInfoProduct) return (
    <ExtraInfoModal
      product={extraInfoProduct}
      batches={batches}
      onClose={() => setExtraInfoProduct(null)}
      onSelectPallet={(batchId, palletId) => {
        setSelectedBatchId(batchId);
        setSelectedPalletId(palletId);
        setExtraInfoProduct(null);
      }}
    />
  );

  if (isBatchModalOpen) return (
    <BatchModal
      batches={batches} selectedBatchId={selectedBatchId}
      onSelectBatch={(id) => { selectBatch(id); setIsBatchModalOpen(false); }}
      onDeleteBatch={deleteBatch}
      onCreateBatch={createNewBatch}
      onEditBatch={() => {}}
      onClose={() => { setIsBatchModalOpen(false); setStartBatchCreation(false); }}
      newBatchName={newBatchName} setNewBatchName={setNewBatchName}
      products={products} startCreating={startBatchCreation}
      onRefresh={async () => { await fetchProductsFromApi(); await refreshBatchesFromDB(); }}
    />
  );

  if (showExcelImport) return (
    <ExcelImportDialog
      title="Inventory Stock"
      columns={inventoryExcelColumns}
      validateRow={validateInventoryImportRow}
      onImport={importInventoryRows}
      onClose={() => setShowExcelImport(false)}
    />
  );

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 overflow-y-auto scrollbar-visible">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Inventory Management</h1>
          <p className="page-subtitle">Track, manage, and monitor all frozen goods SKUs</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => { setNewBatchName(""); setStartBatchCreation(true); setIsBatchModalOpen(true); }} variant="default">Add Items</Button>
          <ExcelActionsDropdown
            onImport={() => setShowExcelImport(true)}
            onExport={handleInventoryExport}
          />
        </div>
      </div>

      {/* Products Section */}
      <div className="space-y-6">

      {/* Batch & Pallet Selector Card */}
      <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-foreground mb-2">Batch</label>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-visible">
            <FilterChip label="All Products" meta={`${products.length} SKUs`} active={selectedBatchId === "batch-all"} onClick={() => selectBatch("batch-all")} />
            {visibleBatches.map((batch) => {
              const itemCount = batch.pallets.reduce((sum: number, p) => sum + p.items.length, 0);
              return (
                <FilterChip key={batch.id} label={batch.name} meta={`${batch.pallets.length} pallets · ${itemCount} items`} active={selectedBatchId === batch.id} onClick={() => selectBatch(batch.id)} />
              );
            })}
            {visibleBatches.length === 0 && <span className="text-xs text-muted-foreground self-center whitespace-nowrap">No batches match the current filters</span>}
          </div>
        </div>

        {currentBatch && currentBatch.id !== "batch-all" && (
          <div className="border-t border-border pt-4">
            <label className="block text-xs font-semibold text-foreground mb-2">Pallets in {currentBatch.name}</label>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-visible">
              <FilterChip label="All pallets" meta={`${currentBatch.pallets.length} total`} active={!selectedPalletId} onClick={() => selectPallet(null)} />
              {visiblePallets.map((pallet) => (
                <FilterChip key={pallet.id} label={pallet.palletId} meta={`${pallet.items.length} item${pallet.items.length !== 1 ? "s" : ""}`} active={selectedPalletId === pallet.id} onClick={() => selectPallet(pallet.id)} />
              ))}
              {visiblePallets.length === 0 && <span className="text-xs text-muted-foreground self-center whitespace-nowrap">No pallets match “{batchSearch}”</span>}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="w-full sm:w-72">
              <SearchFilterBar searchTerm={batchSearch} onSearchChange={setBatchSearch} placeholder="Find a batch or pallet…" />
            </div>
            <input type="datetime-local" value={batchCreatedSince} onChange={(e) => setBatchCreatedSince(e.target.value)} title="Show batches created on or after this date and time" className="rounded-lg border border-border px-3 py-2 text-sm text-foreground" />
          </div>
          <Button onClick={() => setIsBatchModalOpen(true)} variant="outline" className="w-fit">Manage Batches</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-start gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search by SKU or name…" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-4 text-sm focus:border-accent-2 focus:outline-none" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Filter inventory by stock level" value={stockFilter} onChange={(e) => { setStockFilter(e.target.value); setCurrentPage(1); }} className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground">
            <option value="all">All stock</option>
            <option value="low">Reorder needed</option>
            <option value="available">Above reorder level</option>
          </select>
          <select aria-label="Filter inventory by expiry date" value={expiryFilter} onChange={(e) => { setExpiryFilter(e.target.value); setCurrentPage(1); }} className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground">
            <option value="all">All expiry dates</option>
            <option value="has-expiry">Has expiry date</option>
            <option value="no-expiry">No expiry date</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Items" value={batchProducts.length.toString()} icon={Package} />
        <StatCard label="Re-order needed" value={batchProducts.filter((p) => p.batchQuantity <= p.reorderPoint).length.toString()} icon={TriangleAlert} attention={batchProducts.filter((p) => p.batchQuantity <= p.reorderPoint).length > 0} />
        <StatCard label="Total Stock Qty" value={batchProducts.reduce((s, p) => s + p.batchQuantity, 0).toLocaleString()} icon={Hash} />
        <StatCard label="Total Value" value={formatPeso(batchProducts.reduce((s, p) => s + p.unitPrice * p.batchQuantity, 0))} icon={Wallet} />
      </div>

      {/* Inventory Table */}
      <div className="data-table-frame overflow-hidden">
        <div className="overflow-x-auto scrollbar-visible text-xs">
          <Table className="w-full">
            <thead>
              <tr>
                <SortableHeader label="Name" sortKey="name" sort={inventorySort} onSort={setInventorySort} />
                <SortableHeader label="Cost Per Item" sortKey="cost" sort={inventorySort} onSort={setInventorySort} align="right" />
                <SortableHeader label="Stock Qty" sortKey="stock" sort={inventorySort} onSort={setInventorySort} align="center" />
                {selectedBatchId === "batch-all" && (
                  <SortableHeader label="Reorder Level" sortKey="reorder" sort={inventorySort} onSort={setInventorySort} align="right" />
                )}
                {selectedBatchId !== "batch-all" && (
                  <SortableHeader label="Expiry Date" sortKey="expiry" sort={inventorySort} onSort={setInventorySort} />
                )}
                <th style={{ width: '120px' }} className="sticky right-0 z-10 bg-navy-mid text-muted-foreground font-barlow-cond text-xs font-bold px-3 py-3 text-center border-b border-border whitespace-nowrap shadow-left">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedBatchProducts.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No products in this batch</td></tr>
              ) : (
                paginatedBatchProducts.map((product) => {
                  const uniqueKey = product.itemId ? `${product.id}-${product.itemId}` : product.id;
                  const highlightColor = getRowHighlightColor(product.batchQuantity, product.reorderPoint, product.batchExpiryDate);
                  const expiryStatus = selectedBatchId !== "batch-all" && product.batchExpiryDate ? getExpiryStatus(product.batchExpiryDate) : null;
                  return (
                    <tr key={uniqueKey} className={`border-b border-border transition-colors ${highlightColor.bg} ${highlightColor.hover}`}>
                      {/* Name */}
                      <td className="px-3 py-3 text-foreground font-semibold max-w-[200px] truncate">
                        <div className="flex items-center gap-2 truncate">
                          {expiryStatus?.icon && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-2xs font-semibold ${expiryStatus.status === "expired" ? "bg-destructive-soft text-destructive" : "bg-warning-soft text-warning"}`}>{expiryStatus.icon}</span>}
                          <span className="truncate">{product.description}</span>
                        </div>
                      </td>
                      {/* Cost Per Item */}
                      <td className="px-3 py-3 text-right text-foreground whitespace-nowrap">₱{product.unitPrice.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                      {/* Stock Qty */}
                      <td className="px-3 py-3 whitespace-nowrap text-center">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold text-white ${
                          product.batchQuantity / product.reorderPoint < 0.5 ? "bg-red" :
                          product.batchQuantity / product.reorderPoint < 1 ? "bg-gold" :
                          "bg-green"
                        }`}>
                          {product.batchQuantity.toLocaleString()}
                        </span>
                      </td>
                      {/* Reorder Level — read-only display in All Products view */}
                      {selectedBatchId === "batch-all" && (
                        <td className="px-3 py-3 text-right text-foreground whitespace-nowrap font-semibold">
                          {product.reorderPoint.toLocaleString()}
                        </td>
                      )}
                      {/* Expiry Date — display in batch view */}
                      {selectedBatchId !== "batch-all" && (
                        <td className="px-3 py-3 text-left text-foreground whitespace-nowrap text-sm">
                          {product.batchExpiryDate ? parseIsoDate(product.batchExpiryDate).toLocaleDateString("en-PH") : "N/A"}
                        </td>
                      )}
                      {/* Actions */}
                      <td style={{ width: '120px' }} className="sticky right-0 z-10 px-3 py-3 whitespace-nowrap bg-card border-l border-border shadow-left">
                        <div className="flex items-center justify-center gap-1">
                          <ActionButtons
                            onView={() => setExtraInfoProduct(product)}
                            onEdit={undefined}
                            onDelete={() => handleDelete(product.id)}
                            showDelete
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/50">
          <div className="text-xs text-muted-foreground">
            Page {currentPage} of {Math.max(1, totalPages)} · {filteredBatchProducts.length} items
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
    </div>
  );
}

// ─── FilterChip ───────────────────────────────────────────────────────────────
function FilterChip({ label, meta, active, onClick }: { label: string; meta: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`shrink-0 text-left px-3 py-2 rounded-lg border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-accent"}`}>
      <div className="text-sm font-semibold whitespace-nowrap">{label}</div>
      <div className={`text-xs whitespace-nowrap ${active ? "text-white/70" : "text-muted-foreground"}`}>{meta}</div>
    </button>
  );
}


// ─── Extra Info Modal ─────────────────────────────────────────────────────────
function ExtraInfoModal({ product, batches, onClose, onSelectPallet }: { product: InventoryProduct & { batchQuantity: number }; batches: any[]; onClose: () => void; onSelectPallet: (batchId: string, palletId: string) => void }) {
  const batchesWithProduct = batches
    .filter((b) => b.id !== "batch-all" && b.pallets.some((pallet: any) => pallet.items.some((item: any) => item.productId === product.id)))
    .map((batch) => {
      const totalQty = batch.pallets.reduce((sum: number, pallet: any) =>
        sum + (pallet.items.find((item: any) => item.productId === product.id)?.quantity || 0), 0);
      return { batchId: batch.id, batchName: batch.name, quantity: totalQty };
    });

  return (
    <div className="flex-1 px-4 md:px-6 lg:px-7 py-4 md:py-6 overflow-y-auto scrollbar-visible space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{product.description}</h1>
          <p className="page-subtitle">SKU: {product.sku}</p>
        </div>
        <Button onClick={onClose} variant="outline">
          <ArrowLeft size={15} />
          Back
        </Button>
      </div>
      <div className="bg-card rounded-2xl border border-border overflow-hidden">

        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-xs font-bold text-muted-foreground mb-3">Summary</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Inventory Value", `₱${(product.unitPrice * product.batchQuantity).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`],
                ["Reorder Level", product.reorderPoint.toString()],
                ["Last Updated", new Date(product.lastUpdated).toLocaleDateString("en-PH")],
              ].map(([label, value]) => (
                <div key={label} className="bg-muted rounded-lg p-3">
                  <div className="text-xs text-muted-foreground font-semibold mb-0.5">{label}</div>
                  <div className="text-sm font-semibold text-foreground">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-muted-foreground mb-3">Batches Containing This Product</h3>
            {batchesWithProduct.length === 0 ? (
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground">No batches currently contain this product</p>
              </div>
            ) : (
              <div className="space-y-2">
                {batchesWithProduct.map((batch, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSelectPallet(batch.batchId, "")}
                    className="w-full text-left bg-muted hover:bg-accent-2/10 rounded-lg p-3 border border-border hover:border-accent-2 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{batch.batchName}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground font-semibold mb-0.5">Quantity</div>
                        <div className="text-lg font-bold text-accent-2">{batch.quantity.toLocaleString()}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-muted px-6 py-4 border-t border-border flex justify-end">
          <Button onClick={onClose} variant="outline">Close</Button>
        </div>
      </div>
    </div>
  );
}

// ─── BatchModal ────────────────────────────────────────────────────────────────
function BatchModal({ batches, selectedBatchId, onSelectBatch, onDeleteBatch, onCreateBatch, onEditBatch, onClose, newBatchName, setNewBatchName, products, startCreating = false, onRefresh }: { batches: any[]; selectedBatchId: string; onSelectBatch: (id: string) => void; onDeleteBatch: (id: string) => void; onCreateBatch: (items: any[], batchName: string) => void; onEditBatch: (id: string, items: any[]) => void; onClose: () => void; newBatchName: string; setNewBatchName: (n: string) => void; products: InventoryProduct[]; startCreating?: boolean; onRefresh: () => void }) {
  const [isCreatingBatch, setIsCreatingBatch] = useState(startCreating);
  const [pallets, setPallets] = useState<any[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [batchQuery, setBatchQuery] = useState("");
  const [createdSince, setCreatedSince] = useState("");
  const [productFilter, setProductFilter] = useState("");

  const activeBatches = batches.filter((b) => {
    if (b.isArchived || b.id === "batch-all") return false;
    if (batchQuery.trim() && !b.name.toLowerCase().includes(batchQuery.trim().toLowerCase())) return false;
    if (createdSince && new Date(b.createdAt) < new Date(createdSince)) return false;
    if (productFilter && !b.pallets.some((p: any) => p.items.some((item: any) => item.productId === productFilter))) return false;
    return true;
  });
  const archivedBatches = batches.filter((b) => b.isArchived);

  const handleArchiveBatch = async (batchId: string) => {
    const token = localStorage.getItem("auth_token") || "";
    try {
      const response = await fetch(`/api/batches/${batchId}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_archived: true }),
      });
      if (!response.ok) throw new Error("Failed to archive batch");
      await onRefresh();
    } catch (err) {
      console.error("Failed to archive batch:", err);
      toast.error("Failed to archive batch. Please try again.");
    }
  };

  const handleUnarchiveBatch = async (batchId: string) => {
    const token = localStorage.getItem("auth_token") || "";
    try {
      const response = await fetch(`/api/batches/${batchId}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_archived: false }),
      });
      if (!response.ok) throw new Error("Failed to unarchive batch");
      await onRefresh();
    } catch (err) {
      console.error("Failed to unarchive batch:", err);
      toast.error("Failed to unarchive batch. Please try again.");
    }
  };

  return (
    <div className="flex-1 px-4 md:px-6 lg:px-7 py-4 md:py-6 overflow-y-auto scrollbar-visible space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isCreatingBatch ? "Create New Batch" : "Manage Batches"}
          </h1>
        </div>
        <Button onClick={() => { setIsCreatingBatch(false); setPallets([]); onClose(); }} variant="outline">
          <ArrowLeft size={15} />
          Back
        </Button>
      </div>
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="p-6">
          {!isCreatingBatch ? (
            <>
              {!showArchived ? (
                <>
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <input
                      type="search"
                      value={batchQuery}
                      onChange={(e) => setBatchQuery(e.target.value)}
                      placeholder="Search batches by name…"
                      className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                    />
                    <input
                      type="datetime-local"
                      value={createdSince}
                      onChange={(e) => setCreatedSince(e.target.value)}
                      title="Show batches created on or after this date and time"
                      className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                    />
                    <select
                      value={productFilter}
                      onChange={(e) => setProductFilter(e.target.value)}
                      className="rounded-lg border border-border px-3 py-2 text-sm text-foreground bg-card"
                    >
                      <option value="">All products</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.description}</option>
                      ))}
                    </select>
                    {(batchQuery || createdSince || productFilter) && (
                      <Button onClick={() => { setBatchQuery(""); setCreatedSince(""); setProductFilter(""); }} variant="outline">
                        Clear
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2 mb-6">
                    <h3 className="text-xs font-semibold text-muted-foreground mb-3">Active Batches</h3>
                    <div className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${selectedBatchId === "batch-all" ? "border-accent-2 bg-accent-2/10" : "border-border hover:bg-accent"}`} onClick={() => onSelectBatch("batch-all")}>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-foreground">All Products</div>
                        <div className="text-xs text-muted-foreground">View all products across all batches</div>
                      </div>
                    </div>
                    {activeBatches.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4">No active batches</p>
                    ) : (
                      activeBatches.map((batch) => {
                        const totalItems = batch.pallets?.reduce((sum: number, p: any) => sum + (p.items?.length || 0), 0) || 0;
                        return (
                          <div key={batch.id} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${selectedBatchId === batch.id ? "border-accent-2 bg-accent-2/10" : "border-border hover:bg-accent"}`} onClick={() => onSelectBatch(batch.id)}>
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-foreground">{batch.name}</div>
                              <div className="text-xs text-muted-foreground">{totalItems} item{totalItems !== 1 ? "s" : ""}</div>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={(e) => { e.stopPropagation(); handleArchiveBatch(batch.id); }} className="px-2 py-1 bg-warning text-white rounded text-xs font-semibold hover:opacity-90" title="Archive batch"></button>
                              <button onClick={(e) => { e.stopPropagation(); onDeleteBatch(batch.id); }} className="px-2 py-1 bg-red text-white rounded text-xs font-semibold hover:opacity-90"></button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="flex gap-2 justify-between">
                    <Button onClick={() => setShowArchived(true)} variant="secondary">View Archived ({archivedBatches.length})</Button>
                    <Button onClick={() => { setIsCreatingBatch(true); setPallets([]); setNewBatchName(""); }} variant="success">Create New Batch</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2 mb-6">
                    <h3 className="text-xs font-semibold text-muted-foreground mb-3">Archived Batches</h3>
                    {archivedBatches.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4">No archived batches</p>
                    ) : (
                      archivedBatches.map((batch) => {
                        const totalItems = batch.pallets?.reduce((sum: number, p: any) => sum + (p.items?.length || 0), 0) || 0;
                        return (
                          <div key={batch.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-foreground">{batch.name}</div>
                              <div className="text-xs text-muted-foreground">{totalItems} item{totalItems !== 1 ? "s" : ""}</div>
                            </div>
                            <div className="flex gap-1">
                              <Button onClick={() => handleUnarchiveBatch(batch.id)} variant="success" size="sm" title="Restore batch"></Button>
                              <button onClick={() => onDeleteBatch(batch.id)} className="px-2 py-1 bg-red text-white rounded text-xs font-semibold hover:opacity-90"></button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="flex justify-start">
                    <Button onClick={() => setShowArchived(false)} variant="default">← Back to Active</Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <CreateBatchForm
              newBatchName={newBatchName}
              setNewBatchName={setNewBatchName}
              pallets={pallets}
              setPallets={setPallets}
              onCreateBatch={async () => {
                setIsCreatingBatch(false);
                setPallets([]);
                onRefresh();
              }}
              onCancel={() => { setIsCreatingBatch(false); setPallets([]); }}
              products={products}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CreateBatchForm ──────────────────────────────────────────────────────────
function CreateBatchForm({ newBatchName, setNewBatchName, pallets, setPallets, onCreateBatch, onCancel, products }: { newBatchName: string; setNewBatchName: (n: string) => void; pallets: any[]; setPallets: (p: any[]) => void; onCreateBatch: () => void; onCancel: () => void; products: InventoryProduct[] }) {
  const [dbProducts, setDbProducts] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [acquisitionDate, setAcquisitionDate] = useState("");

  useEffect(() => {
    fetch("/api/products", { headers: { Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}` } })
      .then((r) => r.ok ? r.json() : []).then(setDbProducts).catch(() => {});
  }, []);

  const allProducts = dbProducts.length > 0 ? dbProducts : products.map((p) => ({ id: p.id, name: p.description, sku: p.sku }));
  const getName = (id: string) => dbProducts.find((p) => p.id === id)?.name || products.find((p) => p.id === id)?.description || "";
  const getSku = (id: string) => dbProducts.find((p) => p.id === id)?.sku || products.find((p) => p.id === id)?.sku || "";

  const addItem = (productId: string) => {
    if (!productId) return;
    const p = products.find((x) => x.id === productId);
    setItems([...items, { productId, quantity: p?.quantity ?? 1, expirationDate: "" }]);
  };

  const removeItem = (itemIdx: number) => {
    setItems(items.filter((_, i) => i !== itemIdx));
  };

  const updateItem = (itemIdx: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[itemIdx][field] = value;
    setItems(newItems);
  };

  const handleCreate = async () => {
    if (!newBatchName.trim() || items.length === 0 || !acquisitionDate) {
      toast.error("Ensure batch name, acquisition date, and at least one item are set");
      return;
    }
    const token = localStorage.getItem("auth_token") || "";
    try {
      const formattedItems = items.map((item) => ({
        product_id: item.productId,
        qty_units: item.quantity,
        expiration_date: item.expirationDate || null,
      }));
      const pallet = { pallet_id: "UNPALLETTED", items: formattedItems };
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ batch_name: newBatchName, acquisition_date: acquisitionDate, pallets: [pallet] }),
      });
      if (!res.ok) {
        const error = await res.json();
        console.error("API Error:", error);
        toast.error("Failed to create batch: " + (error.error || "Unknown error"));
        return;
      }
      console.log("Batch created successfully");
      toast.success("Batch created successfully!");
      setItems([]);
      setAcquisitionDate("");
      // Close the modal and refresh batches
      await onCreateBatch();
    } catch (err) {
      console.error("Failed to create batch:", err);
      toast.error("Failed to create batch: " + String(err));
    }
  };

  const availableProducts = allProducts.filter((p) => {
    const product = products.find((prod) => prod.id === p.id);
    return !product?.isDiscontinued;
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-foreground mb-2">Batch Name *</label>
          <Input type="text" value={newBatchName} onChange={(e) => setNewBatchName(e.target.value)} placeholder="e.g., Morning Delivery, Q1 Restock" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-foreground mb-2">Acquisition Date *</label>
          <Input type="date" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2" />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-foreground">Items *</h3>

        <div>
          <label className="block text-xs font-semibold text-foreground mb-2">Add Products *</label>
          <select onChange={(e) => { if (e.target.value) { addItem(e.target.value); e.target.value = ""; } }} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2">
            <option value="">Choose a product...</option>
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>{p.sku ? `${p.sku} - ` : ""}{p.name}</option>
            ))}
          </select>
        </div>

        {items.length > 0 && (
          <div className="bg-muted rounded-lg p-3 space-y-2">
            <label className="text-xs font-semibold text-foreground">Items ({items.length})</label>
            {items.map((item, itemIdx) => (
              <div key={itemIdx} className="bg-card border border-border rounded p-2 space-y-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-foreground">{getName(item.productId)}</div>
                    <div className="text-xs text-muted-foreground">{getSku(item.productId)}</div>
                  </div>
                  <Input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(itemIdx, "quantity", parseInt(e.target.value) || 1)} className="w-20 px-2 py-1 border border-border rounded text-sm focus:outline-none focus:border-accent-2" />
                  <Button type="button" variant="destructive" size="sm" onClick={() => removeItem(itemIdx)} aria-label="Remove product">✕</Button>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">Expiry Date</label>
                  <Input type="date" value={item.expirationDate || ""} onChange={(e) => updateItem(itemIdx, "expirationDate", e.target.value)} className="w-full px-2 py-1 border border-border rounded text-sm focus:outline-none focus:border-accent-2" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="success" onClick={handleCreate} disabled={!newBatchName.trim() || items.length === 0 || !acquisitionDate}>
          Add items
        </Button>
      </div>
    </div>
  );
}
