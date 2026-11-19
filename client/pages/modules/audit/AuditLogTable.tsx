import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/truncated-text";
import { useMemo, useState } from "react";
import { Check, Copy, Eye } from "lucide-react";
import { AuditLog } from "@shared/api";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { useToast } from "@/hooks/use-toast";
import { Table } from "@/components/ui/table";
import { SortableHeader, SortState, compareValues, newestFirst } from "@/components/SortableHeader";
import { describeLog, getActionBadgeClass, getActionLabel } from "./auditDescribe";

interface AuditLogTableProps {
  logs: AuditLog[];
  onView: (log: AuditLog) => void;
}

const HEAD_CLASS = "whitespace-nowrap";

export function AuditLogTable({ logs, onView }: AuditLogTableProps) {
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState<"timestamp" | "user" | "action" | "description" | "resource" | "resourceId">>(null);
  const { toast } = useToast();

  const copyResourceId = async (log: AuditLog) => {
    if (!log.resource_id) return;
    try {
      await navigator.clipboard.writeText(log.resource_id);
      setCopiedId(log.id);
      window.setTimeout(() => setCopiedId((current) => current === log.id ? null : current), 1500);
      toast({ title: "Copied", description: "Full reference ID copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard access is unavailable.", variant: "destructive" });
    }
  };

  const actions = useMemo(() => Array.from(new Set(logs.map((log) => log.action))).sort(), [logs]);
  const resources = useMemo(() => Array.from(new Set(logs.map((log) => log.resource_type))).sort(), [logs]);

  const filteredLogs = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return logs.filter((log) => {
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (resourceFilter !== "all" && log.resource_type !== resourceFilter) return false;
      if (terms.length === 0) return true;
      const haystack = [
        describeLog(log),
        log.user_id,
        log.user_name,
        log.action,
        log.resource_type,
        log.resource_id ?? "",
        new Date(log.created_at).toLocaleString(),
      ].join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [logs, query, actionFilter, resourceFilter]);

  const sortedLogs = useMemo(() => {
    if (!sort) return newestFirst(filteredLogs);
    const value = (log: AuditLog) => ({ timestamp: log.created_at, user: log.user_name, action: getActionLabel(log.action), description: describeLog(log), resource: log.resource_type, resourceId: log.resource_id })[sort.key];
    return [...filteredLogs].sort((a, b) => compareValues(value(a), value(b)) * (sort.direction === "asc" ? 1 : -1));
  }, [filteredLogs, sort]);

  return (
    <div className="flex flex-col gap-4">
      <SearchFilterBar
        searchTerm={query}
        onSearchChange={setQuery}
        placeholder="Search by description, user, action, resource, or date…"
        filters={[
          {
            name: "action",
            value: actionFilter,
            onChange: setActionFilter,
            options: [
              { label: "All actions", value: "all" },
              ...actions.map((action) => ({ label: action, value: action })),
            ],
          },
          {
            name: "resource",
            value: resourceFilter,
            onChange: setResourceFilter,
            options: [
              { label: "All resources", value: "all" },
              ...resources.map((resource) => ({ label: resource.replace(/_/g, " "), value: resource })),
            ],
          },
        ]}
      />

      <div className="data-table-frame overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <SortableHeader label="Timestamp" sortKey="timestamp" sort={sort} onSort={setSort} />
                <SortableHeader label="User" sortKey="user" sort={sort} onSort={setSort} />
                <SortableHeader label="Action" sortKey="action" sort={sort} onSort={setSort} />
                <SortableHeader label="Description" sortKey="description" sort={sort} onSort={setSort} />
                <SortableHeader label="Resource" sortKey="resource" sort={sort} onSort={setSort} />
                <SortableHeader label="Resource ID" sortKey="resourceId" sort={sort} onSort={setSort} />
                <th className={`${HEAD_CLASS} bg-muted text-right text-xs font-semibold text-muted-foreground`}>Details</th>
              </tr>
            </thead>
            <tbody>
              {sortedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    {logs.length === 0 ? "No activity yet" : "No entries match your search"}
                  </td>
                </tr>
              ) : (
                sortedLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-border transition-colors hover:bg-accent/50"
                  >
                    <td className="px-3 py-3 whitespace-nowrap text-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-semibold text-foreground">{log.user_name || "Unknown user"}</div>
                      <div className="font-mono text-xs text-muted-foreground">{log.user_id.slice(0, 8)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${getActionBadgeClass(log.action)}`}>
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td className="max-w-[28rem] px-3 py-3 text-foreground"><TruncatedText>{describeLog(log)}</TruncatedText></td>
                    <td className="px-3 py-3 capitalize text-foreground whitespace-nowrap">
                      {log.resource_type.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {log.resource_id ? (
                        <span className="inline-flex items-center gap-1.5" title={log.resource_id}>
                          <span>#{log.resource_id.slice(0, 6).toUpperCase()}</span>
                          <Button
                            type="button"
                            onClick={() => void copyResourceId(log)}
                            aria-label={`Copy full ID ${log.resource_id}`} variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
                            {copiedId === log.id ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                          </Button>
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        onClick={() => onView(log)}
                        aria-label="View details" variant="outline" size="icon" className="h-8 w-8">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>

        <div className="border-t border-border bg-muted/50 px-6 py-4 text-xs text-muted-foreground">
          Showing {filteredLogs.length} of {logs.length} entries
        </div>
      </div>
    </div>
  );
}
