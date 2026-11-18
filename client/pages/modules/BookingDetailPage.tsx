import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Booking, Product } from "@shared/api";
import { OrderTotalsBreakdown } from "@/components/OrderTotalsBreakdown";

interface BookingDetailPageProps {
  booking: Booking;
  products: Product[];
  getStatusColor: (status: string) => string;
  onBack: () => void;
}

export function BookingDetailPage({ booking, products, getStatusColor, onBack }: BookingDetailPageProps) {
  return (
    <div className="flex-1 flex flex-col p-6 gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Order Details</h1>
          <p className="page-subtitle">Review the details of this order</p>
        </div>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft size={15} />
          Back
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6 space-y-6">
        {/* Order Header */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Order ID</label>
            <div className="px-3 py-2 bg-muted rounded-lg text-sm font-mono text-foreground font-semibold">
              {booking.id}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Status</label>
            <div className="px-3 py-2 bg-muted rounded-lg text-sm">
              <span className={`px-2 py-1 rounded text-sm font-semibold ${getStatusColor(booking.status)}`}>
                {booking.status}
              </span>
            </div>
          </div>
        </div>

        {/* Customer Info */}
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Customer Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Store Name</label>
              <p className="text-sm text-foreground font-semibold">{booking.customer?.store_name || "N/A"}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Location</label>
              <p className="text-sm text-foreground">{booking.customer?.location || "N/A"}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Contact Person</label>
              <p className="text-sm text-foreground">{booking.customer?.contact_person || "N/A"}</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Contact Info</label>
              <p className="text-sm text-foreground">{booking.customer?.contact_info || "N/A"}</p>
            </div>
          </div>
        </div>

        {/* Truck Assignment */}
        {(booking as any).truck_id && (
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Assigned Truck</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">License Plate</label>
                <p className="text-sm text-foreground font-semibold">{(booking as any).truck?.license_plate || "N/A"}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">District</label>
                <p className="text-sm text-foreground">{(booking as any).truck?.district || "N/A"}</p>
              </div>
            </div>
          </div>
        )}

        {/* Order Items */}
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Order Items</h3>
          {booking.booking_items && booking.booking_items.length > 0 ? (
            <div className="space-y-2">
              {booking.booking_items.map((item, idx) => {
                const product = products.find((p) => p.id === item.product_id);
                return (
                  <div key={idx} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">{product?.name || "Unknown Product"}</p>
                      <p className="text-xs text-muted-foreground">{product?.sku || "No SKU"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{item.qty_ordered} units</p>
                      <p className="text-xs text-muted-foreground">₱{parseFloat(product?.price || "0").toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No items in this order</p>
          )}
        </div>

        <OrderTotalsBreakdown booking={booking} products={products} />

        {/* Timestamps */}
        <div className="border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-semibold text-muted-foreground mb-1 block">Created</label>
              <p className="text-foreground">{new Date(booking.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
