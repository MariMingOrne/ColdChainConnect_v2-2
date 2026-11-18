export function applyReservationsToSourceItems<T extends { id: string; product_id: string; qty_units: number; created_at: Date | string }>(
  stockItems: T[],
  palletReservedBySource: Map<string, number>,
  orderReservedByProduct: Map<string, number>,
) {
  const remainingByProduct = new Map(orderReservedByProduct);
  const result = new Map<string, number>();
  const orderedItems = [...stockItems].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id.localeCompare(b.id),
  );

  for (const item of orderedItems) {
    const availableAfterPallets = Math.max(0, item.qty_units - (palletReservedBySource.get(item.id) ?? 0));
    const orderHeld = Math.min(availableAfterPallets, remainingByProduct.get(item.product_id) ?? 0);
    remainingByProduct.set(item.product_id, (remainingByProduct.get(item.product_id) ?? 0) - orderHeld);
    result.set(item.id, availableAfterPallets - orderHeld);
  }

  return result;
}
