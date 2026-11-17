import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { modulePermissionKeys, modulePermissionLabels, type ModulePermission } from "@shared/api";
import { Button } from "@/components/ui/button";

type ManagedUser = {
  id: string;
  username: string;
  role: "admin" | "staff";
  created_at: string;
  mfa_enabled: boolean;
  module_permissions: ModulePermission[];
};

export function ManagedUsers({ role, onCreateAccount }: { role: ManagedUser["role"]; onCreateAccount?: () => void }) {
  const token = useAuth((state) => state.token);
  const currentUser = useAuth((state) => state.user);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
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

  const filteredUsers = useMemo(() => users.filter((account) => account.username.toLowerCase().includes(search.toLowerCase())), [users, search]);
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
  const title = role === "admin" ? "Admin Management" : "Staff Management";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden px-4 py-4 md:px-6 md:py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-rajdhani text-3xl font-bold tracking-tight text-navy">{title}</h1><p className="mt-1 text-xs text-muted">Manage {role} accounts</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {currentUser?.role === "admin" && <button type="button" onClick={onCreateAccount} className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Create Accounts</button>}
        </div>
      </div>
      {error && <p className="rounded-lg border border-red/30 bg-red/10 px-4 py-3 text-sm text-red">{error}</p>}
      <SearchFilterBar searchTerm={search} onSearchChange={(value) => { setSearch(value); setCurrentPage(1); }} placeholder={`Search ${role} accounts by username…`} />
      {saveMessage && <p role="status" className="text-sm text-navy">{saveMessage}</p>}
      {isLoading ? <div className="flex flex-1 items-center justify-center"><LoadingSpinner /></div> : paginatedUsers.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center text-sm text-muted">No {role} accounts match your search.</div>
      ) : (
        <div className="grid flex-1 content-start grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {paginatedUsers.map((account) => (
            <article key={account.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 transition-shadow hover:shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-mid"><span className="font-rajdhani text-sm font-bold text-white">{account.username.slice(0, 2).toUpperCase()}</span></div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-navy">{account.username}</div><div className="truncate text-xs text-muted">@{account.username}</div></div>
                <span className="shrink-0 rounded px-2 py-0.5 text-xs font-bold capitalize badge-green">{account.role}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border pt-2 text-xs">
                <div><span className="block text-muted">MFA</span><span className="font-medium text-navy">{account.mfa_enabled ? "Enabled" : "Not set up"}</span></div>
                <div><span className="block text-muted">Created</span><span className="font-medium text-navy">{new Date(account.created_at).toLocaleDateString()}</span></div>
              </div>
              {account.role === "staff" && currentUser?.role === "admin" && (
                <div className="border-t border-border pt-2">
                  <h2 className="mb-2 text-xs font-bold text-navy">Module access</h2>
                  <div className="grid grid-cols-1 gap-1.5">
                    {modulePermissionKeys.map((permission) => (
                      <label key={permission} className="flex items-start gap-2 text-xs text-navy">
                        <input type="checkbox" checked={account.module_permissions?.includes(permission) ?? false} onChange={() => togglePermission(account.id, permission)} className="mt-0.5 accent-navy" />
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
        <span className="text-xs text-muted">Page {currentPage} of {Math.max(1, totalPages)} · {filteredUsers.length} {role} accounts</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} className="rounded border border-border px-3 py-1 text-xs font-semibold hover:bg-white disabled:opacity-50">← Prev</button>
          <span className="rounded border border-border bg-white px-3 py-1 text-xs font-semibold text-navy">{currentPage}</span>
          <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages} className="rounded border border-border px-3 py-1 text-xs font-semibold hover:bg-white disabled:opacity-50">Next →</button>
        </div>
      </div>
    </div>
  );
}
