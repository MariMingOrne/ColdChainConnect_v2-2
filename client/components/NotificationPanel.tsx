import { useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, Boxes, ClipboardList, Inbox, LoaderCircle, RefreshCw, Truck, X, type LucideIcon } from "lucide-react";
import type { AppNotification } from "@/hooks/useNotifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

interface NotificationPanelProps {
  notifications: AppNotification[];
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
}

type NotificationFilter = "all" | AppNotification["type"];

const TYPE: Record<AppNotification["type"], { label: string; icon: LucideIcon }> = {
  orders: { label: "Orders", icon: ClipboardList },
  stock: { label: "Low stock", icon: Boxes },
  delivery: { label: "Delivery", icon: Truck },
  receivable: { label: "Receivables", icon: Banknote },
};

const FILTERS: { value: NotificationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "orders", label: "Orders" },
  { value: "stock", label: "Stock" },
  { value: "delivery", label: "Delivery" },
  { value: "receivable", label: "Receivables" },
];

function formatWhen(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Slide-over notification list (shadcn Sheet: focus is trapped while open,
 * Esc and the overlay close it, focus returns to the bell afterwards).
 */
export function NotificationPanel({
  notifications,
  isLoading,
  error,
  onRefresh,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onClose,
}: NotificationPanelProps) {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const visible = filter === "all" ? notifications : notifications.filter((notification) => notification.type === filter);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="space-y-3 border-b border-border px-5 py-4 text-left">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <SheetTitle>Notifications</SheetTitle>
              <SheetDescription>
                {isLoading && notifications.length === 0
                  ? "Checking for updates…"
                  : `${unreadCount} unread`}
              </SheetDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onRefresh} aria-label="Refresh notifications" className="h-8 w-8">
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} aria-hidden="true" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleGroup
              type="single"
              value={filter}
              onValueChange={(value) => value && setFilter(value as NotificationFilter)}
              aria-label="Filter notifications"
              className="justify-start"
            >
              {FILTERS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value} size="sm" className="h-8 px-3 text-xs">
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {unreadCount > 0 && (
              <Button variant="link" size="sm" onClick={onMarkAllAsRead} className="h-8 px-0 text-xs">
                Mark all as read
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <p role="alert" className="m-4 rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {visible.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-muted-foreground">
              {isLoading ? <LoaderCircle className="mb-2 h-8 w-8 animate-spin" aria-hidden="true" /> : <Inbox className="mb-2 h-8 w-8" aria-hidden="true" />}
              <p className="font-medium">{isLoading ? "Loading notifications" : "No notifications"}</p>
              <p className="text-sm">{isLoading ? "Checking recent activity…" : "You're all caught up."}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((notification) => {
                const { label, icon: Icon } = TYPE[notification.type];
                return (
                  <li
                    key={notification.id}
                    className={cn("flex gap-3 px-5 py-4", !notification.read && "bg-info-soft/60")}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-foreground">
                            {!notification.read && <span className="sr-only">Unread: </span>}
                            {notification.title}
                          </h3>
                          <Badge variant="secondary" className="mt-1 text-2xs font-medium">{label}</Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Dismiss ${notification.title}`}
                          onClick={() => onDismiss(notification.id)}
                          className="-mr-2 -mt-1 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                      <p className="mt-2 text-sm text-foreground">{notification.message}</p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <time dateTime={notification.timestamp} className="text-xs text-muted-foreground">
                          {formatWhen(notification.timestamp)}
                        </time>
                        <div className="flex items-center gap-1">
                          {!notification.read && (
                            <Button variant="ghost" size="sm" onClick={() => onMarkAsRead(notification.id)} className="h-8 text-xs">
                              Mark read
                            </Button>
                          )}
                          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                            <Link
                              to={notification.href}
                              onClick={() => {
                                onMarkAsRead(notification.id);
                                onClose();
                              }}
                            >
                              View
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
