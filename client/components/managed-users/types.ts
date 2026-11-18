import type { ModulePermission } from "@shared/api";

export type ManagedUser = {
  id: string;
  username: string;
  role: "admin" | "staff";
  created_at: string;
  mfa_enabled: boolean;
  mfa_required: boolean;
  module_permissions: ModulePermission[];
};
