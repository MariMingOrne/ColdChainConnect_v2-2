import { Button } from "@/components/ui/button";
import { Booking } from "@shared/api";

interface AgentPendingOrdersProps {
  orders: Booking[];
  currentUserId: string;
  rollingBackId: string | null;
  onRollback: (booking: Booking) => void;
}

export function AgentPendingOrders({
  orders,
  currentUserId,
  rollingBackId,
  onRollback,
}: AgentPendingOrdersProps) {
  if (orders.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-12">No pending orders</p>;
  }

  return (
    <ul className="space-y-3">
      {orders.map((order) => {
        const totalQty = (order.booking_items ?? []).reduce((sum, item) => sum + item.qty_ordered, 0);
        const isOwn = order.created_by === currentUserId;

        return (
          <li key={order.id} className="bg-card rounded-xl border border-border p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-mono text-muted-foreground">#{order.id.slice(0, 8)}</p>
                <p className="text-sm font-semibold text-foreground truncate">
                  {order.customer?.store_name || "Unknown customer"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {totalQty} items · {new Date(order.created_at).toLocaleDateString()}
                  {order.creator && ` · ${order.creator.agent?.full_name || order.creator.username}`}
                </p>
              </div>
              <span className="px-2 py-1 rounded text-xs font-semibold bg-warning-soft text-warning">
                Pending
              </span>
            </div>
            <Button
              type="button"
              onClick={() => onRollback(order)}
              disabled={!isOwn || rollingBackId === order.id} variant="danger" size="sm" className="w-full rounded-full text-xs disabled:opacity-40">
              {rollingBackId === order.id
                ? "Rolling back…"
                : isOwn
                  ? "Roll back order"
                  : "Created by another agent"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
