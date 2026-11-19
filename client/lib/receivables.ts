const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_TERMS_DAYS = 30;

export interface DueInfo {
  dueDate: Date;
  /** Whole days past the due date; 0 on the due day, negative before it. */
  daysOverdue: number;
  overdue: boolean;
}

/** Due date = the day the receivable was created plus the customer's payment terms. */
export function dueInfo(createdAt: string, termsDays: number | null | undefined, now: Date = new Date()): DueInfo {
  const created = new Date(createdAt);
  const terms = termsDays && termsDays > 0 ? termsDays : DEFAULT_TERMS_DAYS;
  const dueDate = new Date(created.getTime() + terms * DAY_MS);
  const daysOverdue = Math.floor((startOfDay(now) - startOfDay(dueDate)) / DAY_MS);
  return { dueDate, daysOverdue, overdue: daysOverdue > 0 };
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Only unpaid, positive balances can be overdue; credits and paid records never are. */
export function isReceivableCollectable(status: string, amountDue: string): boolean {
  return status !== "paid" && parseFloat(amountDue) > 0;
}

export interface OverdueSummary {
  customerId: string;
  customerName: string;
  count: number;
  total: number;
  oldestDaysOverdue: number;
  /** Creation time of the oldest overdue record, for notification ordering. */
  since: string;
}

interface ReceivableLike {
  customer_id: string;
  status: string;
  amount_due: string;
  created_at: string;
}

interface CustomerLike {
  id: string;
  store_name: string;
  credit_terms_days?: number;
}

/** Overdue, collectable receivables grouped per customer, worst first. */
export function summarizeOverdue(records: ReceivableLike[], customers: CustomerLike[], now: Date = new Date()): OverdueSummary[] {
  const byId = new Map(customers.map((customer) => [customer.id, customer]));
  const groups = new Map<string, OverdueSummary>();

  for (const record of records) {
    if (!isReceivableCollectable(record.status, record.amount_due)) continue;
    const customer = byId.get(record.customer_id);
    const info = dueInfo(record.created_at, customer?.credit_terms_days, now);
    if (!info.overdue) continue;

    const existing = groups.get(record.customer_id);
    const amount = parseFloat(record.amount_due);
    if (!existing) {
      groups.set(record.customer_id, {
        customerId: record.customer_id,
        customerName: customer?.store_name ?? record.customer_id.slice(0, 8),
        count: 1,
        total: amount,
        oldestDaysOverdue: info.daysOverdue,
        since: record.created_at,
      });
    } else {
      existing.count += 1;
      existing.total += amount;
      if (info.daysOverdue > existing.oldestDaysOverdue) {
        existing.oldestDaysOverdue = info.daysOverdue;
        existing.since = record.created_at;
      }
    }
  }

  return [...groups.values()].sort((a, b) => b.oldestDaysOverdue - a.oldestDaysOverdue);
}
