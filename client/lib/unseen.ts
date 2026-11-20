/**
 * "New" indicators, Messenger-style: each sidebar tab shows how many records were created since this
 * user last opened it, and the table rows that arrived in that window carry a left accent line.
 * "Last opened" is kept per user in localStorage; nothing is stored on the server.
 */
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

export type SeenKey = "orders" | "receipts" | "customers" | "dispatch" | "accounts" | "returns" | "payments" | "expenses";

/** Sidebar badge sources: the "new" count of a section, or a current count such as products to reorder. */
export type BadgeKey = SeenKey | "reorder" | "outstanding" | "pendingOrders";

/** Sidebar route -> the section whose new records it counts. */
export const SEEN_KEY_BY_PATH: Record<string, SeenKey> = {
  "/booking-dispatch/order-summary": "orders",
  "/booking-dispatch/invoicing": "receipts",
  "/information-management/customers": "customers",
  "/booking-dispatch/delivery": "dispatch",
  "/booking-dispatch/accounts": "accounts",
  "/booking-dispatch/agent-returns": "returns",
  "/accounting/payments": "payments",
  "/accounting/expenses": "expenses",
};

/** Sidebar route -> the count its badge shows. */
export const BADGE_KEY_BY_PATH: Record<string, BadgeKey> = {
  ...SEEN_KEY_BY_PATH,
  "/booking-dispatch/order-summary": "pendingOrders",
  "/information-management/inventory": "reorder",
  "/booking-dispatch/accounts": "outstanding",
};

const KEYS = Object.values(SEEN_KEY_BY_PATH);
const POLL_MS = 60_000;
const storageKey = (userId: string) => `ccc-seen:${userId}`;

function readSeen(userId: string): Partial<Record<SeenKey, string>> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId)) ?? "{}");
  } catch {
    return {};
  }
}

function writeSeen(userId: string, value: Partial<Record<SeenKey, string>>) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(value));
  } catch {
    /* private mode: badges simply reset on reload */
  }
}

/** Last-seen time for a section; the first time we see a section, everything already there counts as seen. */
function lastSeen(userId: string, key: SeenKey): string {
  const seen = readSeen(userId);
  if (!seen[key]) {
    seen[key] = new Date().toISOString();
    writeSeen(userId, seen);
  }
  return seen[key] as string;
}

/** Sidebar badge counts, refreshed every minute. */
export function useUnseenCounts() {
  const token = useAuth((state) => state.token);
  const user = useAuth((state) => state.user);
  const canSee = user?.role === "admin" || user?.role === "staff";
  const query = useQuery({
    queryKey: ["unseen", user?.id],
    enabled: Boolean(token && user && canSee),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false, // hidden tabs stop polling, so an idle database can sleep
    staleTime: 30_000,
    queryFn: async (): Promise<Partial<Record<BadgeKey, number>>> => {
      const params = new URLSearchParams();
      for (const key of KEYS) params.set(key, lastSeen(user!.id, key));
      const res = await fetch(`/api/unseen?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`unseen responded ${res.status}`);
      return res.json();
    },
  });
  return query.data ?? {};
}

/**
 * Call on a screen that lists records of one section. Returns `isNew(createdAt)` for the rows that
 * arrived since the user was last here, and marks the section as seen so its sidebar badge clears.
 */
export function useNewRows(key: SeenKey) {
  const userId = useAuth((state) => state.user?.id);
  const queryClient = useQueryClient();
  // Rows are compared against the moment the user *arrived*, so they stay highlighted during this visit.
  const since = useRef<number | null>(null);
  if (since.current === null && userId) since.current = new Date(lastSeen(userId, key)).getTime();

  useEffect(() => {
    if (!userId) return;
    const mark = (refresh: boolean) => {
      const seen = readSeen(userId);
      seen[key] = new Date().toISOString();
      writeSeen(userId, seen);
      // Only refetch on enter/leave; the regular poll picks up the new baseline in between.
      if (refresh) void queryClient.invalidateQueries({ queryKey: ["unseen"] });
    };
    mark(true);
    const timer = window.setInterval(() => mark(false), POLL_MS);
    return () => {
      window.clearInterval(timer);
      mark(true);
    };
  }, [userId, key, queryClient]);

  return (createdAt?: string | Date | null) =>
    since.current !== null && createdAt != null && new Date(createdAt).getTime() > since.current;
}

/** Row classes for a freshly created record (use with `isNew`). */
export const NEW_ROW_CLASS = "row-new";
