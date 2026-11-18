import { Button } from "@/components/ui/button";
import { confirmAction } from "@/lib/confirm";
import { useState } from "react";
import { ArrowLeft, MoreVertical } from "lucide-react";
import { Booking, Customer, Pallet, formatCustomerAddress, totalDiscountRate } from "@shared/api";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { formatMoney, palletItemTotal, palletTotal, palletStatusOptions } from "./palletUtils";
import { PalletStatusBadge } from "./PalletTable";

interface PalletDetailProps {
  pallet: Pallet;
  order: Booking | null;
  customer: Customer | null;
  getProductName: (productId: string) => string;
  onStatusChange: (status: Pallet["status"]) => void;
  onPrintSheet: () => void;
  isUpdatingStatus: boolean;
  onBack: () => void;
}

export function PalletDetail({
  pallet,
  order,
  customer,
  getProductName,
  onStatusChange,
  onPrintSheet,
  isUpdatingStatus,
  onBack,
}: PalletDetailProps) {
  const items = pallet.items ?? [];
  const units = items.reduce((sum, item) => sum + item.qty_units, 0);
  const discountRate = totalDiscountRate(order?.customer?.discounts);
  const totalValue = palletTotal(pallet);
  const [menuOpen, setMenuOpen] = useState(false);
  const statusIndex = palletStatusOptions.findIndex((option) => option.value === pallet.status);
  const nextStatus = palletStatusOptions[statusIndex + 1];
  const previousStatus = statusIndex > 0 ? palletStatusOptions[statusIndex - 1] : undefined;

  const handleRevert = async () => {
    setMenuOpen(false);
    if (!previousStatus) return;
    if (await confirmAction(`Revert this pallet from ${palletStatusOptions[statusIndex].label} to ${previousStatus.label}?`)) {
      onStatusChange(previousStatus.value);
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm font-semibold text-accent-2 hover:text-accent-1"
      >
        <ArrowLeft size={16} />
        Back to deliveries
      </button>

      <Card className="bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Pallet</p>
            <h2 className="mt-1 font-mono text-lg font-bold text-foreground">{pallet.id}</h2>
          </div>
          <div className="flex items-center gap-3">
            <PalletStatusBadge status={pallet.status} />
            <Button
              type="button"
              onClick={onPrintSheet}
              disabled={!order}
              variant="outline"
            >
              Print delivery sheet
            </Button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isUpdatingStatus || !nextStatus}
                onClick={() => nextStatus && onStatusChange(nextStatus.value)}
                className="rounded-lg bg-accent-2 px-4 py-2 text-sm font-semibold text-white hover:opacity-80 disabled:opacity-50"
              >
                {nextStatus ? `Mark as ${nextStatus.label}` : "Completed"}
              </button>
              <div className="relative">
                <button
                  type="button"
                  aria-label="More status actions"
                  disabled={isUpdatingStatus || !previousStatus}
                  onClick={() => setMenuOpen((open) => !open)}
                  className="rounded-lg border border-border bg-card p-2 text-foreground hover:bg-accent disabled:opacity-50"
                >
                  <MoreVertical size={16} />
                </button>
                {menuOpen && previousStatus && (
                  <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-border bg-card py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={handleRevert}
                      className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-accent"
                    >
                      Revert to {previousStatus.label}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Customer</p>
            <p className="mt-1 font-medium text-foreground">{customer?.store_name ?? "Unknown customer"}</p>
          </div>
          <div className="md:col-span-1 xl:col-span-2">
            <p className="text-xs font-semibold text-muted-foreground">Delivery address</p>
            <p className="mt-1 text-sm text-foreground">{customer ? formatCustomerAddress(customer) : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Order</p>
            <p className="mt-1 font-mono text-sm text-foreground">{order?.id ?? pallet.order_id}</p>
            <p className="mt-1 text-xs text-muted-foreground">Created {new Date(pallet.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden rounded-xl bg-card shadow-sm lg:col-span-2">
          <Table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-semibold">Product</th>
                <th className="px-4 py-3 text-right font-semibold">Qty</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Unit cost</th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">Line total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{getProductName(item.product_id)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.qty_units}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatMoney(Number(item.unit_cost))}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                    {formatMoney(palletItemTotal(item))}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No items in this pallet.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>

        <Card className="flex flex-col justify-center gap-4 bg-card p-6">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Total value</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{formatMoney(totalValue)}</p>
          </div>
          {discountRate > 0 && (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer discount ({Number((discountRate * 100).toFixed(2))}%)</span>
                <span className="tabular-nums text-red">-{formatMoney(totalValue * discountRate)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1">
                <span className="font-semibold text-foreground">Net after discount</span>
                <span className="font-bold tabular-nums text-foreground">{formatMoney(totalValue * (1 - discountRate))}</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Products</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{items.length}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Units</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{units}</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
