import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { ManagedUserCard } from "@/components/managed-users/ManagedUserCard";
import { ManagedUserModal } from "@/components/managed-users/ManagedUserModal";
import type { ManagedUser } from "@/components/managed-users/types";

export function ManagedUsers({ role, onCreateAccount }: { role: ManagedUser["role"]; onCreateAccount?: () => void }) {
  const token = useAuth((state) => state.token);
  const currentUser = useAuth((state) => state.user);
  const [accounts, setAccounts] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mfaSavingId, setMfaSavingId] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<ManagedUser | null>(null);
  const [search, setSearch] = useState("");
  const [mfaFilter, setMfaFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const isAdmin = currentUser?.role === "admin";
  const roleLabel = role === "admin" ? "Admin" : "Accounting";

  const fetchAccounts = async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Could not load accounts");
      const data = (await response.json()) as ManagedUser[];
      setAccounts(data.filter((account) => account.role === role));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load accounts");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void fetchAccounts(); }, [role, token]);

  const filteredAccounts = useMemo(() => accounts.filter((account) =>
    account.username.toLowerCase().includes(search.toLowerCase()) &&
    (mfaFilter === "all" || (mfaFilter === "enabled" ? account.mfa_enabled : !account.mfa_enabled))
  ), [accounts, search, mfaFilter]);
  const totalPages = Math.ceil(filteredAccounts.length / itemsPerPage);
  const paginatedAccounts = filteredAccounts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const updateAccount = (id: string, patch: Partial<ManagedUser>) => {
    setAccounts((current) => current.map((account) => (account.id === id ? { ...account, ...patch } : account)));
  };

  if (isLoading) {
    return (
      <div className="flex-1 px-4 md:px-6 lg:px-7 py-4 md:py-6">
        <LoadingSpinner className="min-h-64" />
      </div>
    );
  }

  if (editingAccount) {
    return (
      <ManagedUserModal
        key={editingAccount.id}
        account={editingAccount}
        token={token}
        onClose={() => setEditingAccount(null)}
        onUpdated={(patch) => updateAccount(editingAccount.id, patch)}
      />
    );
  }

  const updateMfaRequirement = async (account: ManagedUser, required: boolean) => {
    setMfaSavingId(account.id);
    try {
      const response = await fetch(`/api/users/${account.id}/mfa-required`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mfa_required: required }),
      });
      if (!response.ok) throw new Error("Failed to update MFA requirement");
      updateAccount(account.id, { mfa_required: required });
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Failed to update MFA requirement");
    } finally {
      setMfaSavingId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden px-4 py-4 md:px-6 md:py-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-rajdhani text-3xl font-bold text-navy letter-spacing-tight">
            {role === "admin" ? "Admin Management" : "Accounting Management"}
          </h1>
          <p className="text-xs text-muted mt-1">Manage {roleLabel.toLowerCase()} accounts</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button onClick={onCreateAccount} className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              Create Accounts
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red/10 border border-red/30 text-red rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <SearchFilterBar
        searchTerm={search}
        onSearchChange={(value) => { setSearch(value); setCurrentPage(1); }}
        placeholder={`Search ${roleLabel.toLowerCase()} accounts by username…`}
        className="!flex-none"
        filters={[{ name: "MFA Status", value: mfaFilter, onChange: (value) => { setMfaFilter(value); setCurrentPage(1); }, options: [{ label: "All MFA Status", value: "all" }, { label: "Enabled", value: "enabled" }, { label: "Not set up", value: "not-enabled" }] }]}
      />

      {paginatedAccounts.length === 0 ? (
        <div className="text-center text-muted text-sm py-12">
          {accounts.length === 0 ? `No ${roleLabel.toLowerCase()} accounts found` : "No results matching your search"}
        </div>
      ) : (
        <div className="grid flex-1 content-start grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 stagger-children">
          {paginatedAccounts.map((account) => (
            <ManagedUserCard
              key={account.id}
              account={account}
              canManage={isAdmin}
              isSavingMfa={mfaSavingId === account.id}
              onMfaRequirementChange={(required) => void updateMfaRequirement(account, required)}
              onEdit={() => setEditingAccount(account)}
            />
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between px-2 py-2">
        <div className="text-xs text-muted">
          Page {currentPage} of {Math.max(1, totalPages)} · {filteredAccounts.length} {roleLabel.toLowerCase()} accounts
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 border border-border rounded text-xs font-semibold hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="px-3 py-1 text-xs font-semibold text-navy bg-white rounded border border-border">
            {currentPage}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="px-3 py-1 border border-border rounded text-xs font-semibold hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
