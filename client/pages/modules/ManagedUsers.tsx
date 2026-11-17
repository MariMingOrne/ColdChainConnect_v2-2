import { useEffect, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/LoadingSpinner";
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

export function ManagedUsers({ role }: { role: ManagedUser["role"] }) {
  const token = useAuth((state) => state.token);
  const currentUser = useAuth((state) => state.user);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load accounts");
        return response.json() as Promise<ManagedUser[]>;
      })
      .then((accounts) => { if (active) setUsers(accounts.filter((account) => account.role === role)); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load accounts"); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [role, token]);

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
  const title = role === "admin" ? "Admin Accounts" : "Staff Accounts";

  return (
    <div className="flex-1 space-y-6 px-4 py-4 md:px-6 md:py-6">
      <div className="page-header"><div><h1 className="page-title">{title}</h1><p className="page-subtitle">Manage {role} account access.</p></div></div>
      {isLoading ? <LoadingSpinner /> : error ? <p className="rounded-xl border border-red/30 bg-white p-5 text-sm text-red">{error}</p> : users.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted">No {role} accounts found.</div>
      ) : (
        <>
        {saveMessage && <p role="status" className="text-sm text-navy">{saveMessage}</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {users.map((account) => (
            <article key={account.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-mid"><Icon size={18} className="text-white" /></div>
                <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold text-navy">{account.username}</h2><p className="text-xs text-muted">@{account.username}</p></div>
                <span className="rounded-full bg-green/10 px-2 py-1 text-xs font-semibold capitalize text-green">{account.role}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                <div><span className="block text-muted">MFA</span><span className="font-medium text-navy">{account.mfa_enabled ? "Enabled" : "Not set up"}</span></div>
                <div><span className="block text-muted">Created</span><span className="font-medium text-navy">{new Date(account.created_at).toLocaleDateString()}</span></div>
              </div>
              {account.role === "staff" && currentUser?.role === "admin" && (
                <div className="border-t border-border pt-3">
                  <h3 className="mb-2 text-xs font-bold text-navy">Module access</h3>
                  <div className="space-y-2">
                    {modulePermissionKeys.map((permission) => (
                      <label key={permission} className="flex items-start gap-2 text-xs text-navy">
                        <input type="checkbox" checked={account.module_permissions?.includes(permission) ?? false} onChange={() => togglePermission(account.id, permission)} className="mt-0.5 accent-navy" />
                        <span>{modulePermissionLabels[permission]}</span>
                      </label>
                    ))}
                  </div>
                  <Button type="button" size="sm" className="mt-3 w-full" onClick={() => void savePermissions(account)} disabled={savingId === account.id}>
                    {savingId === account.id ? "Saving…" : "Save Access"}
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
