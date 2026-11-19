import { FormEvent, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { modulePermissionKeys, type ModulePermission } from "@shared/api";
import {
  AccountForm,
  AccountType,
  CreateAccountFields,
  emptyAccountForm,
} from "./CreateAccountFields";

const typeLabels: Record<AccountType, string> = {
  agent: "Agent",
  driver: "Driver",
  admin: "Admin",
  staff: "Staff",
};

interface CreateAccountDialogProps {
  onClose: () => void;
}

export function CreateAccountDialog({ onClose }: CreateAccountDialogProps) {
  const token = useAuth((state) => state.token);
  const [accountType, setAccountType] = useState<AccountType>("agent");
  const [modulePermissions, setModulePermissions] = useState<ModulePermission[]>([]);
  const [form, setForm] = useState<AccountForm>(emptyAccountForm);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setForm(emptyAccountForm());
    setModulePermissions([]);
    setError(null);
    onClose();
  };

  const submitAccount = (): Promise<Response> => {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    if (accountType === "driver") {
      return fetch("/api/drivers", {
        method: "POST",
        headers,
        body: JSON.stringify({
          full_name: form.full_name,
          contact_info: form.contact_info,
          license: form.license,
          hire_date: form.hire_date,
          employment_type: form.employment_type || undefined,
          is_active: form.is_active,
          username: form.username || undefined,
          password: form.password || undefined,
        }),
      });
    }

    if (accountType === "agent") {
      return fetch("/api/agents", {
        method: "POST",
        headers,
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          full_name: form.full_name,
          email: form.email,
          contact_info: form.contact_info,
          emergency_contact: form.emergency_contact,
          hire_date: form.hire_date,
          is_active: form.is_active,
        }),
      });
    }

    return fetch("/api/users", {
      method: "POST",
      headers,
      body: JSON.stringify({ username: form.username, password: form.password, role: accountType, ...(accountType === "staff" ? { module_permissions: modulePermissions } : {}) }),
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await submitAccount();
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Could not create account");
        return;
      }
      handleClose();
    } catch {
      setError("Could not reach the server");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-6 p-4 md:p-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Create Account</h1>
          <p className="page-subtitle">Only admins can create accounts.</p>
        </div>
        <button type="button" onClick={handleClose} className="btn-ghost">
          <ArrowLeft size={15} />
          Back
        </button>
      </div>

        <Tabs
          value={accountType}
          onValueChange={(value) => {
            setAccountType(value as AccountType);
            setError(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="agent">Agent</TabsTrigger>
            <TabsTrigger value="driver">Driver</TabsTrigger>
            <TabsTrigger value="admin">Admin</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={handleSubmit} className="space-y-4">
          <CreateAccountFields accountType={accountType} form={form} onChange={setForm} modulePermissions={modulePermissions} onModulePermissionsChange={setModulePermissions} />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end">
            <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : `Create ${typeLabels[accountType]}`}
            </Button>
          </div>
        </form>
    </div>
  );
}
