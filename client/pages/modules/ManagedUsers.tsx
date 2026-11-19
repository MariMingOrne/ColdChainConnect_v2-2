import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { confirmAction } from "@/lib/confirm";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { modulePermissionKeys, modulePermissionLabels, type ModulePermission } from "@shared/api";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/useCan";

type ManagedUser = {
  id: string;
  username: string;
  role: "admin" | "staff";
  created_at: string;
  mfa_enabled: boolean;
  mfa_required: boolean;
  is_archived: boolean;
  module_permissions: ModulePermission[];
};

export function ManagedUsers({ role, onCreateAccount }: { role: ManagedUser["role"]; onCreateAccount?: () => void }) {
  const token = useAuth((state) => state.token);
  const currentUser = useAuth((state) => state.user);
  const canArchiveUsers = useCan("user:archive");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [mfaSavingId, setMfaSavingId] = useState<string | null>(null);
  const [archiveSavingId, setArchiveSavingId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mfaFilter, setMfaFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const fetchAccounts = async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Could not load accounts");
      const accounts = await response.json() as ManagedUser[];
      setUsers(accounts.filter((account) => account.role === role));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load accounts");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void fetchAccounts(); }, [role, token]);

  const filteredUsers = useMemo(() => users.filter((account) =>
    account.username.toLowerCase().includes(search.toLowerCase()) &&
    (statusFilter === "archived" ? account.is_archived : !account.is_archived) &&
    (mfaFilter === "all" || (mfaFilter === "enabled" ? account.mfa_enabled : !account.mfa_enabled))
  ), [users, search, statusFilter, mfaFilter]);
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const updateMfaRequirement = async (account: ManagedUser, required: boolean) => {
    setMfaSavingId(account.id);
    setSaveMessage(null);
    try {
      const response = await fetch(`/api/users/${account.id}/mfa-required`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mfa_required: required }),
      });
      if (!response.ok) throw new Error("Could not update MFA requirement");
      setUsers((current) => current.map((user) => user.id === account.id ? { ...user, mfa_required: required } : user));
      setSaveMessage(`MFA requirement ${required ? "enabled" : "disabled"} for ${account.username}.`);
    } catch (cause) {
      setSaveMessage(cause instanceof Error ? cause.message : "Could not update MFA requirement");
    } finally {
      setMfaSavingId(null);
    }
  };

  const updateArchiveStatus = async (account: ManagedUser, archived: boolean) => {
    const prompt = archived
      ? `Archive ${account.username}? They will not be able to sign in until restored.`
      : `Restore ${account.username}? They will be able to sign in again.`;
    if (!(await confirmAction(prompt))) return;

    setArchiveSavingId(account.id);
    setSaveMessage(null);
    try {
      const response = await fetch(`/api/users/${account.id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_archived: archived }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Could not update account status");
      }
      setUsers((current) => current.map((user) => user.id === account.id ? { ...user, is_archived: archived } : user));
      setSaveMessage(`${account.username} ${archived ? "archived" : "restored"}.`);
    } catch (cause) {
      setSaveMessage(cause instanceof Error ? cause.message : "Could not update account status");
    } finally {
      setArchiveSavingId(null);
    }
  };

  const togglePermission = (userId: string, permission: ModulePermission) => {
    setUsers((current) => current.map((account) => account.id !== userId ? account : {
      ...account,
      module_permissions: account.module_permissions.includes(permission)
        ? account.module_permissions.filter((value) => value !== permission)
        : [...account.module_permissions, permission],
    }));
  };

  const savePermissions = async (account: ManagedUser) => {
    setSavingId(account.id);
    setSaveMessage(null);
    try {
      const response = await fetch(`/api/users/${account.id}/module-permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ module_permissions: account.module_permissions }),
      });
      if (!response.ok) throw new Error("Could not save module access");
      setSaveMessage(`Access updated for ${account.username}.`);
    } catch (cause) {
      setSaveMessage(cause instanceof Error ? cause.message : "Could not save module access");
    } finally {
      setSavingId(null);
    }
  };

  const Icon = role === "admin" ? ShieldCheck : Users;
  const roleLabel = role === "admin" ? "Admin" : "Staff";
  const title = role === "admin" ? "Admin Management" : "Staff Management";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden px-4 py-4 md:px-6 md:py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-rajdhani text-3xl font-bold tracking-tight text-foreground">{title}</h1><p className="mt-1 text-xs text-muted-foreground">Manage {roleLabel.toLowerCase()} accounts</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {currentUser?.role === "admin" && <Button type="button" onClick={onCreateAccount} variant="default">Create Accounts</Button>}
        </div>
      </div>
      {error && <p className="rounded-lg border border-red/30 bg-red/10 px-4 py-3 text-sm text-red">{error}</p>}
      <SearchFilterBar searchTerm={search} onSearchChange={(value) => { setSearch(value); setCurrentPage(1); }} placeholder={`Search ${roleLabel.toLowerCase()} accounts by username…`} className="!flex-none" filters={[{ name: "Status", value: statusFilter, onChange: (value) => { setStatusFilter(value); setCurrentPage(1); }, options: [{ label: "Active accounts", value: "active" }, { label: "Archived accounts", value: "archived" }] }, { name: "MFA Status", value: mfaFilter, onChange: (value) => { setMfaFilter(value); setCurrentPage(1); }, options: [{ label: "All MFA Status", value: "all" }, { label: "Enabled", value: "enabled" }, { label: "Not set up", value: "not-enabled" }] }]} />
      {saveMessage && <p role="status" className="text-sm text-foreground">{saveMessage}</p>}
      {isLoading ? <div className="flex flex-1 items-center justify-center"><LoadingSpinner /></div> : paginatedUsers.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">No {roleLabel.toLowerCase()} accounts match your search.</div>
      ) : (
        <div className="grid flex-1 content-start grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {paginatedUsers.map((account) => (
            <article key={account.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-mid"><span className="font-rajdhani text-sm font-bold text-white">{account.username.slice(0, 2).toUpperCase()}</span></div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-foreground">{account.username}</div><div className="truncate text-xs text-muted-foreground">@{account.username}</div></div>
                <span className="shrink-0 rounded px-2 py-0.5 text-xs font-bold badge-green">{account.role === "staff" ? "Staff" : "Admin"}</span>
                {account.is_archived && <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">Archived</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border pt-2 text-xs">
                <div><span className="block text-muted-foreground">MFA enrollment</span><span className="font-medium text-foreground">{account.mfa_enabled ? "Set up" : "Not set up"}</span></div>
                <div><span className="block text-muted-foreground">Created</span><span className="font-medium text-foreground">{new Date(account.created_at).toLocaleDateString()}</span></div>
              </div>
              {currentUser?.role === "admin" && (
                <label className="flex items-center justify-between gap-3 border-t border-border pt-2 text-xs font-semibold text-foreground">
                  <span>Require MFA at sign-in</span>
                  <Input type="checkbox" checked={account.mfa_required} disabled={mfaSavingId === account.id} onChange={(event) => void updateMfaRequirement(account, event.target.checked)} className="h-4 w-4 accent-navy" />
                </label>
              )}
              {canArchiveUsers && account.id !== currentUser?.id && (
                <Button type="button" variant={account.is_archived ? "outline" : "destructive"} size="sm" disabled={archiveSavingId === account.id} onClick={() => void updateArchiveStatus(account, !account.is_archived)}>
                  {archiveSavingId === account.id ? "Saving…" : account.is_archived ? "Restore Account" : "Archive Account"}
                </Button>
              )}
              {account.role === "staff" && currentUser?.role === "admin" && (
                <div className="border-t border-border pt-2">
                  <h2 className="mb-2 text-xs font-bold text-foreground">Module access</h2>
                  <div className="grid grid-cols-1 gap-1.5">
                    {modulePermissionKeys.map((permission) => (
                      <label key={permission} className="flex items-start gap-2 text-xs text-foreground">
                        <Input type="checkbox" checked={account.module_permissions?.includes(permission) ?? false} onChange={() => togglePermission(account.id, permission)} className="mt-0.5 accent-navy" />
                        <span>{modulePermissionLabels[permission]}</span>
                      </label>
                    ))}
                  </div>
                  <Button type="button" size="sm" className="mt-3 w-full" onClick={() => void savePermissions(account)} disabled={savingId === account.id}>{savingId === account.id ? "Saving…" : "Save Access"}</Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between px-2 py-2">
        <span className="text-xs text-muted-foreground">Page {currentPage} of {Math.max(1, totalPages)} · {filteredUsers.length} {role} accounts</span>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} variant="outline" size="sm">Previous</Button>
          <span className="rounded border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">{currentPage}</span>
          <Button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages} variant="outline" size="sm">Next</Button>
        </div>
      </div>
    </div>
  );
}
