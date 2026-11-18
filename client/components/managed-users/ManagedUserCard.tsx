import type { ManagedUser } from "./types";

export function ManagedUserCard({
  account,
  canManage,
  isSavingMfa,
  onEdit,
  onMfaRequirementChange,
}: {
  account: ManagedUser;
  canManage: boolean;
  isSavingMfa: boolean;
  onEdit: () => void;
  onMfaRequirementChange: (required: boolean) => void;
}) {
  const initials = account.username.slice(0, 2).toUpperCase();
  const roleLabel = account.role === "staff" ? "Accounting" : "Admin";

  return (
    <div className="bg-white border border-border rounded-2xl p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-navy-mid flex items-center justify-center shrink-0">
          <span className="font-rajdhani font-bold text-sm text-white">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-navy text-sm truncate">{account.username}</div>
          <div className="text-xs text-muted truncate">@{account.username}</div>
        </div>
        <span className="shrink-0 inline-block px-2 py-0.5 rounded text-xs font-bold badge-green">{roleLabel}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <span className="text-muted block">MFA enrollment</span>
          <span className="text-navy font-medium">{account.mfa_enabled ? "Set up" : "Not set up"}</span>
        </div>
        <div>
          <span className="text-muted block">Created</span>
          <span className="text-navy font-medium">{new Date(account.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {canManage && (
        <>
          <label className="flex items-center justify-between gap-3 border-t border-border pt-2 text-xs font-semibold text-navy">
            <span>Require MFA at sign-in</span>
            <input
              type="checkbox"
              checked={account.mfa_required}
              disabled={isSavingMfa}
              onChange={(event) => onMfaRequirementChange(event.target.checked)}
              className="h-4 w-4 accent-navy"
            />
          </label>
          <div className="flex gap-2 pt-1 border-t border-border">
            <button onClick={onEdit} className="flex-1 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-off-white text-navy transition-colors">Edit</button>
          </div>
        </>
      )}
    </div>
  );
}
