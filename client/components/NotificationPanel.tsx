import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import type { AppNotification } from "@/hooks/useNotifications";

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
  const filteredNotifications = filter === "all"
    ? notifications
    : notifications.filter((notification) => notification.type === filter);

  const getTypeColor = (type: AppNotification["type"]) => {
    switch (type) {
      case "stock": return "bg-warning-soft border-warning/30";
      case "orders": return "bg-info-soft border-link/30";
      case "delivery": return "bg-warning-soft border-warning/30";
    }
  };

  const getTypeLabel = (type: AppNotification["type"]) => {
    switch (type) {
      case "stock": return "Low Stock";
      case "orders": return "Orders";
      case "delivery": return "Delivery";
    }
  };

  const filters: { value: NotificationFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "orders", label: "Orders" },
    { value: "stock", label: "Stock" },
    { value: "delivery", label: "Delivery" },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <button
        type="button"
        aria-label="Close notifications"
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 bottom-0 flex w-full flex-col overflow-hidden bg-card shadow-2xl sm:w-96">
        <div className="flex-shrink-0 border-b border-border bg-card px-4 py-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground">Notifications</h2>
              <p className="text-sm text-muted-foreground">
                {isLoading && notifications.length === 0
                  ? "Checking for updates…"
                  : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRefresh}
                aria-label="Refresh notifications"
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <RefreshCw size={17} className={isLoading ? "animate-spin" : ""} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-xl text-muted-foreground transition-colors hover:text-foreground"
              >
                ×
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilter(tab.value)}
                className={`rounded border px-2.5 py-1.5 text-xs transition ${filter === tab.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground hover:border-primary"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {unreadCount > 0 && (
          <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2">
            <button
              type="button"
              onClick={onMarkAllAsRead}
              className="text-xs font-semibold text-primary transition-colors hover:text-accent-dark"
            >
              Mark all as read
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-visible">
          {error && (
            <p role="alert" className="m-4 rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {filteredNotifications.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-4 text-center">
              <div className="mb-3 text-4xl">{isLoading ? "⏳" : "📭"}</div>
              <p className="font-medium text-muted-foreground">{isLoading ? "Loading notifications" : "No notifications"}</p>
              <p className="text-sm text-muted-foreground">{isLoading ? "Checking recent activity…" : "You're all caught up!"}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredNotifications.map((notification) => (
                <article
                  key={notification.id}
                  className={`border-l-4 border-l-transparent p-4 transition ${notification.read ? "bg-card" : "border-l-accent bg-info-soft"}`}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 text-2xl">{notification.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">{notification.title}</h3>
                          <span className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-2xs font-medium ${getTypeColor(notification.type)}`}>
                            {getTypeLabel(notification.type)}
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-label={`Dismiss ${notification.title}`}
                          onClick={() => onDismiss(notification.id)}
                          className="flex-shrink-0 text-muted-foreground transition-colors hover:text-red"
                        >
                          ×
                        </button>
                      </div>
                      <p className="mt-2 text-sm text-foreground">{notification.message}</p>
                      <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                        <span className="text-xs text-muted-foreground">{notification.timestamp}</span>
                        <div className="flex items-center gap-3">
                          {!notification.read && (
                            <button
                              type="button"
                              onClick={() => onMarkAsRead(notification.id)}
                              className="text-xs font-semibold text-primary transition-colors hover:text-accent-dark"
                            >
                              Mark read
                            </button>
                          )}
                          <Link
                            to={notification.href}
                            onClick={() => {
                              onMarkAsRead(notification.id);
                              onClose();
                            }}
                            className="text-xs font-semibold text-primary transition-colors hover:text-accent-dark"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
