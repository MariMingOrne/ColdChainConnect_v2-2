import type { Booking, InventoryBatch } from "@shared/api";

export const PALLET_CAPACITY = 50;

export type PalletDraft = {
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

export function buildAutomaticPallets(order: Booking, batches: InventoryBatch[]) {
  const pallets: PalletDraft[] = [];
  const shortages: string[] = [];
  const assignedBySource = new Map<string, number>();
  let currentPallet: PalletDraft = { items: [], totalQty: 0 };

  for (const orderItem of order.booking_items || []) {
    let remainingQty = orderItem.qty_ordered;

    const matchingItems = batches
      .flatMap((batch) =>
        (batch.items || [])
          .filter((item) => item.product_id === orderItem.product_id)
          .map((item) => ({ batchName: batch.name, item }))
      )
      .sort((a, b) => new Date(a.item.created_at).getTime() - new Date(b.item.created_at).getTime());

    for (const { batchName, item } of matchingItems) {
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
      shortages.push(`Insufficient inventory for ${orderItem.product?.name || orderItem.product_id}: need ${remainingQty} more units`);
    }
  }

  if (currentPallet.items.length > 0) {
    pallets.push(currentPallet);
  }

  return {
    pallets: pallets.length > 0 ? pallets : [{ items: [], totalQty: 0 }],
    shortages,
  };
}

export function isCompletePick(order: Booking, pallets: PalletDraft[]) {
  const requested = new Map<string, number>();
  for (const item of order.booking_items || []) {
    requested.set(item.product_id, (requested.get(item.product_id) ?? 0) + item.qty_ordered);
  }
  const selected = new Map<string, number>();
  for (const pallet of pallets) {
    for (const item of pallet.items) {
      selected.set(item.product_id, (selected.get(item.product_id) ?? 0) + item.qty_units);
    }
  }
  return requested.size === selected.size &&
    [...requested].every(([productId, quantity]) => selected.get(productId) === quantity);
}
