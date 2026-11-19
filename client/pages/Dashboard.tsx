/**
 * Admin dashboard. Question it answers at first glance: "what needs my attention today?"
 * Figures come from /api/dashboard/summary (aggregated server-side); activity from the audit log.
 * Deviation from the dashboard-design house style: no comparison baselines, because the API keeps
 * no history for these counts yet; the "needs attention" list carries the context instead.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Boxes,
  Check,
  CircleCheck,
  ClipboardList,
  Copy,
  PackagePlus,
  ChartNoAxesCombined,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AuditLog, DashboardSummary } from "@shared/api";
import { useAuth } from "../hooks/useAuth";
import { describeLog, getActionBadgeClass, getActionLabel } from "./modules/audit/auditDescribe";
import { SalesForecastWidget } from "@/components/SalesForecastWidget";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatPeso } from "@/lib/utils";
import { toast } from "sonner";

const REFRESH_MS = 120_000;
/** Receivables older than this are flagged. */
const OVERDUE_DAYS = 30;

async function getJson<T>(url: string, token: string | null): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ""}` } });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json() as Promise<T>;
}

const TONES = {
  default: { tile: "bg-primary/10 text-primary", value: "text-foreground", ring: "hover:border-primary/40" },
  warning: { tile: "bg-warning/15 text-warning", value: "text-warning", ring: "border-warning/40 hover:border-warning/70" },
} as const;

function Figure({ to, label, value, detail, icon: Icon, attention = false, loading }: {
  to: string;
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  attention?: boolean;
  loading: boolean;
}) {
  const tone = TONES[attention ? "warning" : "default"];
  return (
    <Link
      to={to}
      className={cn(
        "group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone.ring,
      )}
    >
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tone.tile)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-24" />
        ) : (
          <p className={cn("mt-1 truncate font-rajdhani text-3xl font-bold tabular-nums", tone.value)}>{value}</p>
        )}
        <p className="mt-1 truncate text-xs text-muted-foreground">{loading ? " " : detail}</p>
      </div>
    </Link>
  );
}

type AttentionItem = { key: string; title: string; detail: string; action: string; to: string };

function attentionItems(data: DashboardSummary): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (data.pendingOrders > 0) {
    items.push({
      key: "pending",
      title: `${data.pendingOrders} ${data.pendingOrders === 1 ? "order is" : "orders are"} waiting for approval`,
      detail: "Approve or reject so preparation can start",
      action: "Review orders",
      to: "/booking-dispatch/order-summary?status=pending",
    });
  }
  for (const product of data.lowStock) {
    items.push({
      key: `stock-${product.id}`,
      title: `${product.name} is low on stock`,
      detail: `${product.available.toLocaleString()} available, reorder point ${product.reorderPoint.toLocaleString()}`,
      action: "Receive stock",
      to: "/information-management/inventory?action=receive",
    });
  }
  if (data.receivables.oldestDays !== null && data.receivables.oldestDays > OVERDUE_DAYS) {
    items.push({
      key: "receivables",
      title: `A customer balance is ${data.receivables.oldestDays} days old`,
      detail: `${data.receivables.outstandingCount} outstanding, ${formatPeso(data.receivables.outstandingTotal)} in total`,
      action: "Open receivables",
      to: "/booking-dispatch/accounts",
    });
  }
  return items;
}

function NeedsAttention({ data, loading, failed }: { data?: DashboardSummary; loading: boolean; failed: boolean }) {
  const items = data ? attentionItems(data) : [];
  return (
    <section aria-labelledby="attention-heading" className="rounded-2xl border border-border bg-card shadow-sm">
      <h2 id="attention-heading" className="border-b border-border px-5 py-4 text-lg font-bold text-foreground">Needs attention</h2>
      {loading ? (
        <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : failed ? (
        <p role="status" className="px-5 py-8 text-sm text-muted-foreground">These figures could not be loaded. They retry every two minutes.</p>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-muted-foreground">
          <CircleCheck className="h-5 w-5 text-success" aria-hidden="true" />
          Nothing needs attention right now.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to={item.to}>{item.action}</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentActivity({ logs, loading, failed }: { logs: AuditLog[]; loading: boolean; failed: boolean }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyReference = async (log: AuditLog) => {
    if (!log.resource_id) return;
    try {
      await navigator.clipboard.writeText(log.resource_id);
      setCopiedId(log.id);
      window.setTimeout(() => setCopiedId((current) => (current === log.id ? null : current)), 1500);
      toast.success("Reference copied");
    } catch {
      toast.error("Clipboard access is unavailable");
    }
  };

  return (
    <section aria-labelledby="activity-heading" className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <h2 id="activity-heading" className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Recent activity
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link to="/audit">Audit log</Link>
        </Button>
      </div>
      {loading ? (
        <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : failed ? (
        <p role="status" className="px-5 py-8 text-sm text-muted-foreground">Recent activity is unavailable right now.</p>
      ) : logs.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted-foreground">No activity has been recorded yet.</p>
      ) : (
        <ol className="divide-y divide-border">
          {logs.map((log) => (
            <li key={log.id} className="flex items-start gap-3 px-5 py-3">
              <span className={cn("mt-0.5 inline-flex shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold", getActionBadgeClass(log.action))}>
                {getActionLabel(log.action)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{log.user_name || "A user"}</span>{" "}
                  {describeLog(log).charAt(0).toLowerCase() + describeLog(log).slice(1)}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <time dateTime={log.created_at}>
                    {new Date(log.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                  {log.resource_id && (
                    <button
                      type="button"
                      onClick={() => void copyReference(log)}
                      aria-label={`Copy reference ${log.resource_id}`}
                      className="inline-flex items-center gap-1 rounded px-1 tabular-nums hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      #{log.resource_id.slice(0, 6).toUpperCase()}
                      {copiedId === log.id ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Dashboard() {
  const finishPostLoginLoading = useAuth((state) => state.finishPostLoginLoading);
  const token = useAuth((state) => state.token);

  useEffect(() => {
    finishPostLoginLoading();
  }, [finishPostLoginLoading]);

  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => getJson<DashboardSummary>("/api/dashboard/summary", token),
    enabled: Boolean(token),
    refetchInterval: REFRESH_MS,
  });
  const activity = useQuery({
    queryKey: ["audit-logs", "recent"],
    queryFn: () => getJson<AuditLog[]>("/api/audit-logs?limit=6", token),
    enabled: Boolean(token),
    refetchInterval: REFRESH_MS,
  });

  const data = summary.data;
  const loading = summary.isPending;
  const receivablesOverdue = (data?.receivables.oldestDays ?? 0) > OVERDUE_DAYS;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <main className="flex-1 overflow-y-auto bg-muted/40 px-4 py-5 md:px-6 md:py-6 xl:px-8">
      <div className="w-full space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Operations today</h1>
            <p className="mt-1 text-sm text-muted-foreground">{today}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link to="/booking-dispatch/order-summary?action=new"><ClipboardList aria-hidden="true" />New booking</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/information-management/inventory?action=receive"><PackagePlus aria-hidden="true" />Receive stock</Link>
            </Button>
            <SalesForecastWidget />
            <Button asChild variant="outline">
              <Link to="/reports"><ChartNoAxesCombined aria-hidden="true" />Reports</Link>
            </Button>
          </div>
        </header>

        <section aria-label="Operations at a glance" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Figure
            to="/booking-dispatch/order-summary?status=pending"
            label="Pending orders"
            value={String(data?.pendingOrders ?? 0)}
            detail={data?.pendingOrders ? "Waiting for approval" : "None waiting"}
            icon={ClipboardList}
            attention={(data?.pendingOrders ?? 0) > 0}
            loading={loading}
          />
          <Figure
            to="/booking-dispatch/delivery"
            label="Active deliveries"
            value={String(data?.activeDeliveries ?? 0)}
            detail="Pending or in transit"
            icon={Truck}
            loading={loading}
          />
          <Figure
            to="/information-management/inventory"
            label="Low-stock products"
            value={String(data?.lowStock.length ?? 0)}
            detail={`${(data?.availableUnits ?? 0).toLocaleString()} units in stock`}
            icon={Boxes}
            attention={(data?.lowStock.length ?? 0) > 0}
            loading={loading}
          />
          <Figure
            to="/booking-dispatch/accounts"
            label="Outstanding receivables"
            value={formatPeso(data?.receivables.outstandingTotal ?? 0)}
            detail={
              data && data.receivables.outstandingCount > 0
                ? `${data.receivables.outstandingCount} balances, oldest ${data.receivables.oldestDays} days`
                : "Nothing outstanding"
            }
            icon={Wallet}
            attention={receivablesOverdue}
            loading={loading}
          />
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <NeedsAttention data={data} loading={loading} failed={summary.isError && !data} />
          <RecentActivity logs={activity.data ?? []} loading={activity.isPending} failed={activity.isError && !activity.data} />
        </div>

        {summary.isError && data && (
          <p role="status" className="text-xs text-muted-foreground">
            Showing figures from {new Date(data.generatedAt).toLocaleTimeString()}; the latest refresh failed.
          </p>
        )}
      </div>
    </main>
  );
}
