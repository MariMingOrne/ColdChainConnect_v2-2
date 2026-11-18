import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Booking, InventoryBatch } from "@shared/api";

interface CreatePalletFormProps {
  order: Booking;
  batches: InventoryBatch[];
  onCreated: () => void;
  token: string;
  isPrepared?: boolean;
}

type PalletDraft = {
  items: Array<{
    product_id: string;
    product_name?: string;
    product_sku?: string;
    qty_units: number;
    batch_item_id: string;
    batch_name: string;
    expiry_note?: string;
  }>;
  totalQty: number;
};

export function CreatePalletForm({
  order,
  batches,
  onCreated,
  token,
  isPrepared = false,
}: CreatePalletFormProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [mode, setMode] = useState<"automatic" | "manual">("automatic");
  const [suggestedPallets, setSuggestedPallets] = useState<PalletDraft[]>([]);
  const [manualPallets, setManualPallets] = useState<PalletDraft[]>([
    { items: [], totalQty: 0 }
  ]);
  const [error, setError] = useState<string | null>(null);

  const PALLET_CAPACITY = 50;

  useEffect(() => {
    // Auto-find matching items from inventory sorted by expiry date, splitting into multiple pallets
    const orderItems = order.booking_items || [];
    const pallets: PalletDraft[] = [];
    const assignedBySource = new Map<string, number>();
    let currentPallet: PalletDraft = { items: [], totalQty: 0 };

    for (const orderItem of orderItems) {
      const neededQty = orderItem.qty_ordered;
      let remainingQty = neededQty;

      // Collect all matching inventory items and sort by expiry (nearest first)
      const matchingItems = batches
        .flatMap((batch) =>
          (batch.items || [])
            .filter((item) => item.product_id === orderItem.product_id)
            .map((item) => ({
              batchId: batch.id,
              batchName: batch.name,
              item,
              expiryNote: batch.items?.find(i => i.id === item.id)?.created_at || "",
            }))
        )
        .sort((a, b) => {
          // Sort by expiry date (closer dates first - FIFO)
          const dateA = new Date(a.expiryNote).getTime();
          const dateB = new Date(b.expiryNote).getTime();
          return dateA - dateB;
        });

      // Fill pallets with matching items, creating new pallets when capacity is exceeded
      for (const { batchId, batchName, item } of matchingItems) {
        if (remainingQty <= 0) break;

        const available = Math.max(0, (item.available_units ?? item.qty_units) - (assignedBySource.get(item.id) ?? 0));
        const qtyToTake = Math.min(remainingQty, available);
        if (qtyToTake <= 0) continue;
        assignedBySource.set(item.id, (assignedBySource.get(item.id) ?? 0) + qtyToTake);
        let qtyAdded = 0;

        while (qtyAdded < qtyToTake) {
          const spaceInCurrentPallet = PALLET_CAPACITY - currentPallet.totalQty;
          const qtyForThisPallet = Math.min(qtyToTake - qtyAdded, spaceInCurrentPallet);

          currentPallet.items.push({
            product_id: item.product_id,
            product_name: orderItem.product?.name,
            product_sku: orderItem.product?.sku,
            qty_units: qtyForThisPallet,
            batch_item_id: item.id,
            batch_name: batchName,
            expiry_note: item.created_at,
          });

          currentPallet.totalQty += qtyForThisPallet;
          qtyAdded += qtyForThisPallet;

          if (currentPallet.totalQty >= PALLET_CAPACITY) {
            pallets.push(currentPallet);
            currentPallet = { items: [], totalQty: 0 };
          }
        }

        remainingQty -= qtyToTake;
      }

      if (remainingQty > 0) {
        const productName = orderItem.product?.name || orderItem.product_id;
        setError(`Insufficient inventory for ${productName}: need ${remainingQty} more units`);
      }
    }

    // Add the last pallet if it has items
    if (currentPallet.items.length > 0) {
      pallets.push(currentPallet);
    }

    setSuggestedPallets(pallets.length > 0 ? pallets : [{ items: [], totalQty: 0 }]);
  }, [order, batches]);

  const handleCreatePallet = async () => {
    const palletsToCreate = mode === "automatic" ? suggestedPallets : manualPallets;
    const validPallets = palletsToCreate.filter((p) => p.items.length > 0);

    if (validPallets.length === 0) {
      setError("Please select items for at least one pallet");
      return;
    }
    if (!hasCompletePick()) {
      setError("Picked quantities must exactly match the order before pallets can be created.");
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/pallets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          order_id: order.id,
          pallets: validPallets.map((pallet) => ({
            items: pallet.items.map((item) => ({
              product_id: item.product_id,
              qty_units: item.qty_units,
              batch_item_id: item.batch_item_id,
            })),
          })),
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to reserve stock for pallets.");
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pallets");
    } finally {
      setIsCreating(false);
    }
  };

  const getAvailableItems = (productId: string) => {
    return batches
      .flatMap((batch) =>
        (batch.items || [])
          .filter((item) => item.product_id === productId)
          .map((item) => ({
            batch_item_id: item.id,
            batch_name: batch.name,
            qty_available: item.available_units ?? item.qty_units,
            item,
          }))
      )
      .sort((a, b) => {
        const dateA = new Date(a.item.created_at).getTime();
        const dateB = new Date(b.item.created_at).getTime();
        return dateA - dateB;
      });
  };

  const handleManualSelect = (
    palletIdx: number,
    productId: string,
    batchItemId: string,
    qty: number
  ) => {
    setManualPallets((prev) => {
      const updated = [...prev];
      const pallet = updated[palletIdx];
      const existingIdx = pallet.items.findIndex(
        (s) => s.product_id === productId && s.batch_item_id === batchItemId
      );
      const sourceItem = batches.flatMap((batch) => batch.items || []).find((item) => item.id === batchItemId);
      const usedElsewhere = prev.reduce((sum, otherPallet, index) =>
        sum + (index === palletIdx ? 0 : otherPallet.items
          .filter((item) => item.batch_item_id === batchItemId)
          .reduce((itemSum, item) => itemSum + item.qty_units, 0)), 0);
      const available = Math.max(0, (sourceItem?.available_units ?? sourceItem?.qty_units ?? 0) - usedElsewhere);
      if (qty > available) {
        setError(`Only ${available} units are available from this stock item.`);
        return prev;
      }

      if (qty === 0) {
        if (existingIdx >= 0) {
          pallet.totalQty -= pallet.items[existingIdx].qty_units;
          pallet.items.splice(existingIdx, 1);
        }
      } else {
        if (existingIdx >= 0) {
          const oldQty = pallet.items[existingIdx].qty_units;
          pallet.items[existingIdx].qty_units = qty;
          pallet.totalQty += qty - oldQty;
        } else {
          const batchItem = batches
            .flatMap((b) => b.items || [])
            .find((i) => i.id === batchItemId);

          if (!batchItem) return prev;

          const batchName = batches.find(
            (b) => b.items?.some((i) => i.id === batchItemId)
          )?.name || "";

          const orderItem = order.booking_items?.find(
            (oi) => oi.product_id === productId
          );

          pallet.items.push({
            product_id: productId,
            product_name: orderItem?.product?.name,
            product_sku: orderItem?.product?.sku,
            qty_units: qty,
            batch_item_id: batchItemId,
            batch_name: batchName,
            expiry_note: batchItem.created_at,
          });
          pallet.totalQty += qty;
        }
      }

      // Check if pallet exceeds capacity and split if needed
      if (pallet.totalQty > PALLET_CAPACITY) {
        setError(`Pallet would exceed ${PALLET_CAPACITY} unit capacity. Use another pallet.`);
        // Revert the change
        return prev;
      }

      setError(null);
      return updated;
    });
  };

  const addNewPallet = () => {
    setManualPallets((prev) => [...prev, { items: [], totalQty: 0 }]);
  };

  const removePallet = (index: number) => {
    setManualPallets((prev) => prev.filter((_, i) => i !== index));
  };

  const duplicatePallet = (index: number) => {
    setManualPallets((prev) => {
      const palletToDuplicate = prev[index];
      const newPallet: PalletDraft = {
        items: palletToDuplicate.items.map((item) => ({ ...item })),
        totalQty: palletToDuplicate.totalQty,
      };
      return [...prev, newPallet];
    });
  };

  const getTotalQuantityByProduct = () => {
    const totals: { [key: string]: { name: string; qty: number } } = {};
    manualPallets.forEach((pallet) => {
      pallet.items.forEach((item) => {
        const key = item.product_id;
        if (!totals[key]) {
          totals[key] = { name: item.product_name || item.product_id, qty: 0 };
        }
        totals[key].qty += item.qty_units;
      });
    });
    return totals;
  };

  const getProductQuantityStatus = (productId: string) => {
    const orderItem = order.booking_items?.find((item) => item.product_id === productId);
    const totalSelections = getTotalQuantityByProduct();
    const selected = totalSelections[productId]?.qty || 0;

    // Item exists in order
    if (orderItem) {
      const needed = orderItem.qty_ordered;
      const isOver = selected > needed;
      const difference = Math.abs(selected - needed);
      return { needed, selected, isOver, difference, isNotNeeded: false };
    }

    // Item does NOT exist in order but is in pallets
    return { needed: 0, selected, isOver: false, difference: 0, isNotNeeded: selected > 0 };
  };

  const getUnneededItems = () => {
    const totalSelections = getTotalQuantityByProduct();
    const neededProductIds = new Set(
      (order.booking_items || []).map((item) => item.product_id)
    );

    return Object.entries(totalSelections)
      .filter(([productId]) => !neededProductIds.has(productId))
      .map(([productId, { name, qty }]) => ({ productId, name, qty }));
  };

  const hasCompletePick = () => {
    const requested = new Map<string, number>();
    for (const item of order.booking_items || []) {
      requested.set(item.product_id, (requested.get(item.product_id) ?? 0) + item.qty_ordered);
    }
    const selected = new Map<string, number>();
    const selectedPallets = mode === "automatic" ? suggestedPallets : manualPallets;
    for (const pallet of selectedPallets) {
      for (const item of pallet.items) {
        selected.set(item.product_id, (selected.get(item.product_id) ?? 0) + item.qty_units);
      }
    }
    return requested.size === selected.size &&
      [...requested].every(([productId, quantity]) => selected.get(productId) === quantity);
  };

  if (isPrepared) {
    return (
      <div className="bg-card rounded-2xl border border-border w-full shadow-sm p-6 space-y-4">
        <h2 className="font-rajdhani text-lg font-bold text-foreground">Order Prepared</h2>
        <p className="text-sm text-foreground">
          This order has already been marked as prepared. You cannot create additional pallets for this order.
        </p>
        <p className="text-sm text-muted-foreground">
          Click the "Undo" button in the orders table to revert the prepared status if you need to make changes.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border w-full shadow-sm">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">Order ID</label>
          <div className="px-3 py-2 bg-muted rounded-lg text-sm font-mono text-foreground">
            {order.id.slice(0, 8)}
          </div>
        </div>

        <div className="bg-muted p-3 rounded-lg border border-border">
          <p className="text-xs font-semibold text-foreground mb-2">Products Needed:</p>
          <div className="space-y-1">
            {order.booking_items && order.booking_items.length > 0 ? (
              order.booking_items.map((item) => (
                <p key={item.id} className="text-xs text-foreground">
                  • {item.product?.name || item.product_id} <span className="text-muted-foreground">({item.qty_ordered} units)</span>
                </p>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No items in order</p>
            )}
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => setMode("automatic")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              mode === "automatic"
                ? "border-accent-2 text-accent-2"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Automatic (by Expiry)
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              mode === "manual"
                ? "border-accent-2 text-accent-2"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Manual Selection
          </button>
        </div>

        {error && (
          <div className="bg-warning-soft p-3 rounded-lg border border-warning/30">
            <p className="text-xs text-warning">{error}</p>
          </div>
        )}

        {/* Automatic Mode */}
        {mode === "automatic" && (
          <div className="space-y-3">
            {suggestedPallets.length > 0 && suggestedPallets[0].items.length > 0 ? (
              suggestedPallets.map((pallet, palletIdx) => (
                <div key={palletIdx} className="bg-info-soft p-3 rounded-lg border border-link/30">
                  <p className="text-xs font-semibold text-link mb-2">
                    Pallet {palletIdx + 1} (Auto-matched by expiry):
                  </p>
                  <div className="space-y-1">
                    {pallet.items.map((item, idx) => (
                      <p key={idx} className="text-xs text-link">
                        • {item.product_name || item.product_id}: {item.qty_units} units (from {item.batch_name})
                      </p>
                    ))}
                    <p className="text-xs font-semibold text-link mt-2 pt-2 border-t border-link/30">
                      Total: {pallet.totalQty}/{PALLET_CAPACITY} items
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-link">Finding best matches from inventory…</p>
            )}
          </div>
        )}

        {/* Manual Mode */}
        {mode === "manual" && (
          <div className="space-y-4">
            {manualPallets.map((pallet, palletIdx) => (
              <div key={palletIdx} className="border border-border rounded-lg p-3 bg-muted">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-foreground">Pallet {palletIdx + 1}</p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => duplicatePallet(palletIdx)}
                      variant="link" className="h-auto p-0"
                      title="Duplicate this pallet"
                    >
                      Duplicate
                    </Button>
                    {manualPallets.length > 1 && (
                      <button
                        onClick={() => removePallet(palletIdx)}
                        className="text-xs text-destructive hover:text-destructive font-semibold"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {order.booking_items && order.booking_items.length > 0 ? (
                  <div className="space-y-3">
                    {order.booking_items.map((orderItem) => {
                      const availableItems = getAvailableItems(orderItem.product_id);
                      const palletUsed = pallet.items
                        .filter((i) => i.product_id === orderItem.product_id)
                        .reduce((sum, i) => sum + i.qty_units, 0);

                      return (
                        <div
                          key={orderItem.id}
                          className="p-2 bg-card rounded border border-border"
                        >
                          <p className="text-xs font-semibold text-foreground mb-2">
                            {orderItem.product?.name || orderItem.product_id}{" "}
                            {orderItem.product?.sku && (
                              <span className="text-muted-foreground">({orderItem.product.sku})</span>
                            )}
                          </p>
                          {availableItems.length > 0 ? (
                            <div className="space-y-1.5">
                              {availableItems.map((batch) => {
                                const selected = pallet.items.find(
                                  (s) =>
                                    s.product_id === orderItem.product_id &&
                                    s.batch_item_id === batch.batch_item_id
                                );
                                const usedOnOtherPallets = manualPallets.reduce((sum, otherPallet, otherIndex) =>
                                  sum + (otherIndex === palletIdx ? 0 : otherPallet.items
                                    .filter((item) => item.batch_item_id === batch.batch_item_id)
                                    .reduce((itemSum, item) => itemSum + item.qty_units, 0)), 0);
                                const availableForThisPallet = Math.max(0, batch.qty_available - usedOnOtherPallets);
                                return (
                                  <div key={batch.batch_item_id} className="flex items-center gap-2">
                                    <div className="flex-1">
                                      <p className="text-xs text-foreground">
                                        {batch.batch_name}
                                        <span className="text-muted-foreground">
                                          {" "}
                                          ({availableForThisPallet} available)
                                        </span>
                                      </p>
                                    </div>
                                    <Input
                                      type="number"
                                      min="0"
                                      max={Math.min(
                                        availableForThisPallet,
                                        PALLET_CAPACITY - pallet.totalQty + (selected?.qty_units || 0)
                                      )}
                                      value={selected?.qty_units || 0}
                                      onChange={(e) =>
                                        handleManualSelect(
                                          palletIdx,
                                          orderItem.product_id,
                                          batch.batch_item_id,
                                          parseInt(e.target.value) || 0
                                        )
                                      }
                                      className="w-16 px-2 py-1 border border-border rounded text-xs text-center"
                                      placeholder="qty"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-warning">
                              No inventory available for this product
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No items to select</p>
                )}

                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs font-semibold text-foreground">
                    Total: {pallet.totalQty}/{PALLET_CAPACITY} items
                    {pallet.totalQty === PALLET_CAPACITY && (
                      <span className="text-warning ml-1">(at capacity)</span>
                    )}
                  </p>
                </div>
              </div>
            ))}

            <Button
              onClick={addNewPallet}
              variant="outline" size="sm" className="w-full"
            >
              + Add Another Pallet
            </Button>

            {/* Total Quantities Summary */}
            <div className="bg-info-soft p-3 rounded-lg border border-link/30 space-y-2">
              <p className="text-xs font-semibold text-link">Total Quantities Across All Pallets:</p>
              {Object.entries(getTotalQuantityByProduct()).length > 0 ? (
                <div className="space-y-2">
                  {/* Needed items from order */}
                  {(order.booking_items || []).map((orderItem) => {
                    const status = getProductQuantityStatus(orderItem.product_id);
                    return (
                      <div key={orderItem.id} className="flex items-center justify-between">
                        <p className="text-xs text-link">
                          {orderItem.product?.name || orderItem.product_id}:{" "}
                          <span className="font-semibold">{status.selected} units</span>
                          <span className="text-muted-foreground"> (need {status.needed})</span>
                        </p>
                        {status.isOver && (
                          <span className="text-xs font-semibold text-destructive bg-destructive-soft px-2 py-0.5 rounded">
                            +{status.difference} over
                          </span>
                        )}
                        {!status.isOver && status.selected > 0 && status.selected === status.needed && (
                          <span className="text-xs font-semibold text-success bg-success-soft px-2 py-0.5 rounded">
                            ✓ Complete
                          </span>
                        )}
                        {!status.isOver && status.selected > 0 && status.selected < status.needed && (
                          <span className="text-xs font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded">
                            -{status.difference} needed
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Items not needed in order */}
                  {getUnneededItems().length > 0 && (
                    <div className="mt-2 pt-2 border-t border-link/30">
                      <p className="text-xs font-semibold text-destructive mb-1">&#9888; Items Not Needed:</p>
                      {getUnneededItems().map((item) => (
                        <p key={item.productId} className="text-xs text-destructive">
                          • {item.name}: <span className="font-semibold">{item.qty} units</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-link">No items selected yet</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-muted px-6 py-4 flex justify-end gap-2 border-t border-border rounded-b-2xl">
        <Button
          onClick={handleCreatePallet}
          disabled={
            isCreating ||
            !hasCompletePick() ||
            (mode === "automatic" ? suggestedPallets.every((p) => p.items.length === 0) : manualPallets.every((p) => p.items.length === 0))
          }
          variant="default"
        >
          {isCreating
            ? "Creating…"
            : mode === "automatic"
            ? `Create ${suggestedPallets.filter((p) => p.items.length > 0).length} Pallet(s)`
            : `Create ${manualPallets.filter((p) => p.items.length > 0).length} Pallet(s)`}
        </Button>
      </div>
    </div>
  );
}
