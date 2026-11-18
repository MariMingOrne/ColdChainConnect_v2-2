import { useState } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { modulePermissionKeys, modulePermissionLabels, type ModulePermission } from "@shared/api";
import type { ManagedUser } from "./types";
import { notify, confirmAction } from "@/components/ui/app-dialog";

async function requireOk(response: Response, fallback: string) {
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error || fallback);
}

export function ManagedUserModal({
  account,
  token,
  onClose,
  onUpdated,
}: {
  account: ManagedUser;
  token: string | null;
  onClose: () => void;
  onUpdated: (patch: Partial<ManagedUser>) => void;
}) {
  const isStaff = account.role === "staff";
  const originalPermissions = account.module_permissions ?? [];
  const [username, setUsername] = useState(account.username);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState<ModulePermission[]>(originalPermissions);
  const [mfaEnabled, setMfaEnabled] = useState(account.mfa_enabled);
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingMfa, setIsResettingMfa] = useState(false);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);

  const jsonHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const trimmedUsername = username.trim();
  const usernameChanged = trimmedUsername !== account.username;
  const permissionsChanged =
    isStaff &&
    (permissions.length !== originalPermissions.length || permissions.some((value) => !originalPermissions.includes(value)));

  const togglePermission = (permission: ModulePermission) => {
    setPermissions((current) =>
      current.includes(permission) ? current.filter((value) => value !== permission) : [...current, permission]
    );
  };

  const handleSave = async () => {
    if (!trimmedUsername) return notify("Username is required");
    if (password && password.trim().length < 4) return notify("Password must be at least 4 characters");
    if (!usernameChanged && !password && !permissionsChanged) return onClose();

    setIsSaving(true);
    try {
      if (usernameChanged) {
        const response = await fetch(`/api/users/${account.id}`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({ username: trimmedUsername }),
        });
        await requireOk(response, "Failed to update username");
      }
      if (password) {
        const response = await fetch(`/api/users/${account.id}/password`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({ password }),
        });
        await requireOk(response, "Failed to update password");
      }
      if (permissionsChanged) {
        const response = await fetch(`/api/users/${account.id}/module-permissions`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({ module_permissions: permissions }),
        });
        await requireOk(response, "Failed to save module access");
      }
      onUpdated({ username: trimmedUsername, module_permissions: permissions });
      onClose();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Failed to save account");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetMfa = async () => {
    if (!(await confirmAction(`Reset MFA for ${account.username}? They will need to set up their authenticator app again at next sign-in.`))) return;

    setIsResettingMfa(true);
    setMfaMessage(null);
    try {
      const response = await fetch(`/api/users/${account.id}/mfa/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await requireOk(response, "Failed to reset MFA");
      setMfaEnabled(false);
      onUpdated({ mfa_enabled: false });
      setMfaMessage("MFA reset. The next sign-in will ask them to set up a new authenticator.");
    } catch (cause) {
      setMfaMessage(cause instanceof Error ? cause.message : "Failed to reset MFA");
    } finally {
      setIsResettingMfa(false);
    }
  };

  return (
    <div className="flex-1 px-4 md:px-6 lg:px-7 py-4 md:py-6 space-y-6 max-w-2xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Edit {isStaff ? "Accounting" : "Admin"} Account</h1>
        </div>
        <button onClick={onClose} className="btn-ghost">
          <ArrowLeft size={15} />
          Back
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-border">
        <div className="p-6 space-y-4">
          <div className="bg-off-white rounded-xl p-4 space-y-3 border border-border">
            <p className="text-xs font-bold text-muted uppercase tracking-wider">Account Credentials</p>
            <div>
              <label className="block text-xs font-semibold text-navy mb-1">Username</label>
              <Input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
                placeholder="e.g., jdelacruz"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy mb-1">
                Password<span className="text-muted font-normal ml-1">(leave blank to keep current)</span>
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
                  placeholder="Enter new password to change…"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-navy"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>

          {isStaff && (
            <div className="bg-off-white rounded-xl p-4 space-y-3 border border-border">
              <p className="text-xs font-bold text-muted uppercase tracking-wider">Module Access</p>
              <div className="grid grid-cols-1 gap-1.5">
                {modulePermissionKeys.map((permission) => (
                  <label key={permission} className="flex items-start gap-2 text-xs text-navy">
                    <input
                      type="checkbox"
                      checked={permissions.includes(permission)}
                      onChange={() => togglePermission(permission)}
                      className="mt-0.5 accent-navy"
                    />
                    <span>{modulePermissionLabels[permission]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="bg-off-white rounded-xl p-4 space-y-3 border border-border">
            <p className="text-xs font-bold text-muted uppercase tracking-wider">Authenticator (MFA)</p>
            <div className="flex items-center justify-between gap-3">
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${mfaEnabled ? "badge-green" : "badge-red"}`}>
                {mfaEnabled ? "Enabled" : "Not set up"}
              </span>
              {mfaEnabled && (
                <Button type="button" variant="danger" size="sm" onClick={() => void handleResetMfa()} disabled={isResettingMfa}>
                  {isResettingMfa ? "Resetting…" : "Reset MFA"}
                </Button>
              )}
            </div>
            {mfaMessage && <p className="text-xs text-muted">{mfaMessage}</p>}
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 rounded-b-2xl border-t border-border bg-off-white px-6 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="accent" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save Account"}
          </Button>
        </div>
      </div>
    </div>
  );
}
