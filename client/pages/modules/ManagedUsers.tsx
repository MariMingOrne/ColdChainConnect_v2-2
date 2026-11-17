import { useEffect, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/LoadingSpinner";

type ManagedUser = {
  id: string;
  username: string;
  role: "admin" | "staff";
  created_at: string;
  mfa_enabled: boolean;
};

export function ManagedUsers({ role }: { role: ManagedUser["role"] }) {
  const token = useAuth((state) => state.token);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const Icon = role === "admin" ? ShieldCheck : Users;
  const title = role === "admin" ? "Admin Accounts" : "Staff Accounts";

  return (
    <div className="flex-1 space-y-6 px-4 py-4 md:px-6 md:py-6">
      <div className="page-header"><div><h1 className="page-title">{title}</h1><p className="page-subtitle">Manage {role} account access.</p></div></div>
      {isLoading ? <LoadingSpinner /> : error ? <p className="rounded-xl border border-red/30 bg-white p-5 text-sm text-red">{error}</p> : users.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted">No {role} accounts found.</div>
      ) : (
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
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
