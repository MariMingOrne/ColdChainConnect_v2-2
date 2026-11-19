import { toast } from "sonner";
import { PageDialog } from "@/components/shared/PageDialog";
import { confirmAction } from "@/lib/confirm";
import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useCan } from "@/hooks/useCan";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Archive, ArchiveRestore, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Agent, MIN_PASSWORD_LENGTH } from "@shared/api";

interface AgentForm {
  full_name: string;
  email: string;
  contact_info: string;
  emergency_contact: string;
  hire_date: string;
  address: string;
  is_active: boolean;
  username: string;
  password: string;
}

// ─── View Modal ───────────────────────────────────────────────────────────────

function ViewAgentModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  return (
    <div className="flex-1 px-4 md:px-6 lg:px-7 py-4 md:py-6 space-y-6 max-w-2xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Agent Details</h1>
        </div>
        <Button onClick={onClose} variant="outline">
          <ArrowLeft size={15} />
          Back
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-border">

        <div className="p-6 space-y-4">
          {[
            ["Full Name", agent.full_name],
            ["Username", agent.user?.username],
            ["Email", agent.email],
            ["Contact Info", agent.contact_info],
            ["Emergency Contact", agent.emergency_contact],
            ["Hire Date", agent.hire_date],
            ["Address", agent.address],
          ].map(([label, value]) => (
            <div key={label as string}>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">{label}</label>
              <div className="text-sm text-foreground font-medium">{value || "—"}</div>
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Status</label>
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${agent.is_active ? "badge-green" : "badge-red"}`}>
              {agent.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>

        <div className="sticky bottom-0 bg-muted px-6 py-4 flex justify-end border-t border-border rounded-b-2xl">
          <Button onClick={onClose} variant="default">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

function AgentModal({
  title,
  isEdit,
  formData,
  setFormData,
  onClose,
  onSave,
  mfaEnabled,
  isResettingMfa,
  mfaMessage,
  onResetMfa,
}: {
  title: string;
  isEdit: boolean;
  formData: AgentForm;
  setFormData: (data: AgentForm) => void;
  onClose: () => void;
  onSave: () => void;
  mfaEnabled: boolean;
  isResettingMfa: boolean;
  mfaMessage: string | null;
  onResetMfa: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);

  const field = (
    label: string,
    key: keyof AgentForm,
    placeholder?: string,
    type = "text"
  ) => (
    <div>
      <label className="block text-xs font-semibold text-foreground mb-1">{label}</label>
      <Input
        type={type}
        value={formData[key] as string}
        onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="flex-1 px-4 md:px-6 lg:px-7 py-4 md:py-6 space-y-6 max-w-2xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
        </div>
        <Button onClick={onClose} variant="outline">
          <ArrowLeft size={15} />
          Back
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-border">

        <div className="p-6 space-y-4">
          {/* Account Credentials */}
          <div className="bg-muted rounded-xl p-4 space-y-3 border border-border">
            <p className="text-xs font-bold text-muted-foreground">Account Credentials</p>
            {field("Username", "username", "e.g., jdelacruz")}

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Password{isEdit && <span className="text-muted-foreground font-normal ml-1">(leave blank to keep current)</span>}
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 pr-10 border border-border rounded-lg text-sm focus:outline-none focus:border-accent-2"
                  placeholder={isEdit ? "Enter new password to change…" : "Enter password…"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Agent Details */}
          {field("Full Name", "full_name", "e.g., Juan Dela Cruz")}
          {field("Email", "email", "e.g., juan@example.com", "email")}
          {field("Contact Info", "contact_info", "e.g., 09171234567")}
          {field("Emergency Contact", "emergency_contact", "e.g., Name & phone number")}
          {field("Hire Date", "hire_date", "", "date")}
          {field("Address", "address", "e.g., 123 Main St, Makati")}

          <div className="flex items-center gap-3">
            <Input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 accent-navy"
            />
            <label htmlFor="is_active" className="text-sm font-semibold text-foreground">Active Agent</label>
          </div>

          {isEdit && (
            <div className="bg-muted rounded-xl p-4 space-y-3 border border-border">
              <p className="text-xs font-bold text-muted-foreground">Authenticator (MFA)</p>
              <div className="flex items-center justify-between gap-3">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${mfaEnabled ? "badge-green" : "badge-red"}`}>
                  {mfaEnabled ? "Enabled" : "Not set up"}
                </span>
                {mfaEnabled && (
                  <Button type="button" variant="danger" size="sm" onClick={onResetMfa} disabled={isResettingMfa}>
                    {isResettingMfa ? "Resetting…" : "Reset MFA"}
                  </Button>
                )}
              </div>
              {mfaMessage && <p className="text-xs text-muted-foreground">{mfaMessage}</p>}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 rounded-b-2xl border-t border-border bg-muted px-6 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="accent" onClick={onSave}>Save Agent</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  showArchive,
  onView,
  onEdit,
  onArchive,
  canManageMfa,
  isSavingMfa,
  onMfaRequirementChange,
}: {
  agent: Agent;
  showArchive: boolean;
  onView: () => void;
  onEdit?: () => void;
  onArchive: () => void;
  canManageMfa: boolean;
  isSavingMfa: boolean;
  onMfaRequirementChange: (required: boolean) => void;
}) {
  const initials = (agent.full_name || agent.user?.username || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-navy-mid flex items-center justify-center shrink-0">
          <span className="font-rajdhani font-bold text-sm text-white">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground text-sm truncate">
            {agent.full_name || agent.user?.username || "—"}
          </div>
          <div className="text-xs text-muted-foreground truncate">@{agent.user?.username || "—"}</div>
        </div>
        <span className={`shrink-0 inline-block px-2 py-0.5 rounded text-xs font-bold ${agent.is_active ? "badge-green" : "badge-red"}`}>
          {agent.is_active ? "Active" : "Inactive"}
        </span>
        {agent.is_archived && <span className="rounded bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">Archived</span>}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="min-w-0">
          <span className="text-muted-foreground block">Email</span>
          <span className="block truncate text-foreground font-medium">{agent.email || "—"}</span>
        </div>
        <div className="min-w-0">
          <span className="text-muted-foreground block">Contact</span>
          <span className="block truncate text-foreground font-medium">{agent.contact_info || "—"}</span>
        </div>
        <div className="min-w-0">
          <span className="text-muted-foreground block">Hired</span>
          <span className="block truncate text-foreground font-medium">{agent.hire_date || "—"}</span>
        </div>
        <div className="min-w-0">
          <span className="text-muted-foreground block">Address</span>
          <span className="block truncate text-foreground font-medium">{agent.address || "—"}</span>
        </div>
      </div>

      {canManageMfa && agent.user && (
        <label className="flex items-center justify-between gap-3 border-t border-border pt-2 text-xs font-semibold text-foreground">
          <span>Require MFA at sign-in</span>
          <Input type="checkbox" checked={agent.user.mfa_required} disabled={isSavingMfa} onChange={(event) => onMfaRequirementChange(event.target.checked)} className="h-4 w-4 accent-navy" />
        </label>
      )}

      <div className="flex gap-2 pt-1 border-t border-border">
        <Button onClick={onView} variant="outline" size="sm" className="flex-1">View</Button>
        {onEdit && <Button onClick={onEdit} variant="outline" size="sm" className="flex-1">Edit</Button>}
        {showArchive && (
          <Button onClick={onArchive} variant={agent.is_archived ? "outline" : "danger"} size="sm" className="flex-1">
            {agent.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {agent.is_archived ? "Restore" : "Archive"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Agents({ onCreateAccount }: { onCreateAccount?: () => void }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [viewingAgent, setViewingAgent] = useState<Agent | null>(null);
  const [isResettingMfa, setIsResettingMfa] = useState(false);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);
  const [mfaSavingAgentId, setMfaSavingAgentId] = useState<string | null>(null);
  const { token, user: currentUser } = useAuth();
  const canManageAgents = useCan("agent:manage");

  const emptyForm = (): AgentForm => ({
    full_name: "",
    email: "",
    contact_info: "",
    emergency_contact: "",
    hire_date: "",
    address: "",
    is_active: true,
    username: "",
    password: "",
  });

  const [formData, setFormData] = useState<AgentForm>(emptyForm());
  const itemsPerPage = 12;

  const fetchAgents = async () => {
    try {
      const response = await fetch("/api/agents", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch agents");
      setAgents(await response.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading agents");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchAgents();
  }, [token]);

  const filteredAgents = agents.filter(
    (a) =>
      ((a.full_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (a.user?.username?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (a.email?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (a.contact_info?.toLowerCase().includes(searchQuery.toLowerCase()))) &&
      (showArchived ? a.is_archived : !a.is_archived) &&
      (statusFilter === "all" || (statusFilter === "active" ? a.is_active : !a.is_active))
  );

  const totalPages = Math.ceil(filteredAgents.length / itemsPerPage);
  const paginatedAgents = filteredAgents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const openAddModal = () => {
    setEditingAgent(null);
    setFormData(emptyForm());
    setIsModalOpen(true);
  };

  const openEditModal = (agent: Agent) => {
    setEditingAgent(agent);
    setMfaMessage(null);
    setFormData({
      full_name: agent.full_name ?? "",
      email: agent.email ?? "",
      contact_info: agent.contact_info ?? "",
      emergency_contact: agent.emergency_contact ?? "",
      hire_date: agent.hire_date ?? "",
      address: agent.address ?? "",
      is_active: agent.is_active ?? true,
      username: agent.user?.username ?? "",
      password: "",
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingAgent) {
        if (formData.password && formData.password.trim().length < MIN_PASSWORD_LENGTH) {
          toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
          return;
        }
        // PATCH agent profile
        const agentRes = await fetch(`/api/agents/${editingAgent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            full_name: formData.full_name,
            email: formData.email,
            contact_info: formData.contact_info,
            emergency_contact: formData.emergency_contact,
            hire_date: formData.hire_date,
            address: formData.address,
            is_active: formData.is_active,
            username: formData.username || undefined,
          }),
        });
        if (!agentRes.ok) {
          const err = await agentRes.json().catch(() => null);
          throw new Error(err?.error || "Failed to update agent");
        }
        const saved = await agentRes.json();

        // Update password if provided
        if (formData.password && editingAgent.user_id) {
          const userRes = await fetch(`/api/users/${editingAgent.user_id}/password`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ password: formData.password }),
          });
          if (!userRes.ok) throw new Error("Agent saved but password update failed");
        }

        setAgents(agents.map((a) => (a.id === saved.id ? saved : a)));
      } else {
        // Create new agent (account + profile in one call)
        if (!formData.username || !formData.password) {
          toast.error("Username and password are required for new agents");
          return;
        }
        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            username: formData.username,
            password: formData.password,
            full_name: formData.full_name,
            email: formData.email,
            contact_info: formData.contact_info,
            emergency_contact: formData.emergency_contact,
            hire_date: formData.hire_date,
            address: formData.address,
            is_active: formData.is_active,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create agent");
        }
        const created = await res.json();
        setAgents((current) => [created, ...current]);
      }
      setIsModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save agent");
    }
  };

  const updateAgentMfaRequirement = async (agent: Agent, required: boolean) => {
    if (!agent.user_id) return;
    setMfaSavingAgentId(agent.id);
    try {
      const response = await fetch(`/api/users/${agent.user_id}/mfa-required`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mfa_required: required }),
      });
      if (!response.ok) throw new Error("Failed to update MFA requirement");
      setAgents((current) => current.map((item) => item.id === agent.id && item.user ? { ...item, user: { ...item.user, mfa_required: required } } : item));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update MFA requirement");
    } finally {
      setMfaSavingAgentId(null);
    }
  };

  const handleResetMfa = async () => {
    if (!editingAgent?.user_id) return;
    const username = editingAgent.user?.username;
    if (!(await confirmAction(`Reset MFA for ${username}? They will need to set up their authenticator app again at next sign-in.`))) return;

    setIsResettingMfa(true);
    setMfaMessage(null);
    try {
      const res = await fetch(`/api/users/${editingAgent.user_id}/mfa/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to reset MFA");
      }
      const userId = editingAgent.user_id;
      const clearMfa = (a: Agent): Agent =>
        a.user_id === userId && a.user ? { ...a, user: { ...a.user, mfa_enabled: false } } : a;
      setAgents((prev) => prev.map(clearMfa));
      setEditingAgent((prev) => (prev ? clearMfa(prev) : prev));
      setMfaMessage("MFA reset. The next sign-in will ask them to set up a new authenticator.");
    } catch (err) {
      setMfaMessage(err instanceof Error ? err.message : "Failed to reset MFA");
    } finally {
      setIsResettingMfa(false);
    }
  };

  const updateArchiveStatus = async (agent: Agent) => {
    const archived = !agent.is_archived;
    const name = agent.full_name || agent.user?.username || "this agent";
    const prompt = archived
      ? `Archive ${name}? They will not be able to sign in until restored.`
      : `Restore ${name}? They will be able to sign in again.`;
    if (!(await confirmAction(prompt))) return;
    try {
      const response = await fetch(`/api/agents/${agent.id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_archived: archived }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Could not update agent archive status");
      setAgents((current) => current.map((item) => item.id === agent.id ? body as Agent : item));
      toast.success(`${name} ${archived ? "archived" : "restored"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update agent archive status");
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 px-4 md:px-6 lg:px-7 py-4 md:py-6">
        <LoadingSpinner className="min-h-64" />
      </div>
    );
  }





  return (
    <>

    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden px-4 py-4 md:px-6 md:py-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-rajdhani text-3xl font-bold text-foreground">
            Agent Management
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Manage agents — account-linked field staff</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageAgents && (
            <>
              <Button type="button" variant="outline" onClick={() => { setShowArchived((current) => !current); setCurrentPage(1); }}>
                {showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                {showArchived ? "Active Accounts" : `Archived Accounts (${agents.filter((agent) => agent.is_archived).length})`}
              </Button>
              {!showArchived && <Button onClick={() => onCreateAccount ? onCreateAccount() : openAddModal()} variant="default">Create Accounts</Button>}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red/10 border border-red/30 text-red rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Search + Add + Delete Toggle */}
      <SearchFilterBar
        searchTerm={searchQuery}
        onSearchChange={(value) => { setSearchQuery(value); setCurrentPage(1); }}
        placeholder="Search by name, username, email, contact…"
        className="!flex-none"
        filters={[{ name: "Status", value: statusFilter, onChange: (value) => { setStatusFilter(value); setCurrentPage(1); }, options: [{ label: "All Status", value: "all" }, { label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }] }]}
      />

      {/* Cards grid */}
      {paginatedAgents.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-12">
          {showArchived ? "No archived agents match your search" : agents.length === 0 ? "No agents found" : "No results matching your search"}
        </div>
      ) : (
        <div className="grid flex-1 content-start grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 stagger-children">
          {paginatedAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              showArchive={canManageAgents}
              canManageMfa={currentUser?.role === "admin"}
              isSavingMfa={mfaSavingAgentId === agent.id}
              onMfaRequirementChange={(required) => void updateAgentMfaRequirement(agent, required)}
              onView={() => setViewingAgent(agent)}
              onEdit={canManageAgents ? () => openEditModal(agent) : undefined}
              onArchive={() => void updateArchiveStatus(agent)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="mt-auto flex items-center justify-between px-2 py-2">
        <div className="text-xs text-muted-foreground">
          Page {currentPage} of {Math.max(1, totalPages)} · {filteredAgents.length} {showArchived ? "archived " : ""}agents
        </div>
        <div className="flex gap-2 items-center">
          <Button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            variant="outline" size="sm"
          >
            Previous
          </Button>
          <span className="px-3 py-1 text-xs font-semibold text-foreground bg-card rounded border border-border">
            {currentPage}
          </span>
          <Button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            variant="outline" size="sm"
          >
            Next
          </Button>
        </div>
      </div>

    </div>
  
      {(viewingAgent) && (
        <PageDialog onClose={() => setViewingAgent(null)}>
<ViewAgentModal agent={viewingAgent} onClose={() => setViewingAgent(null)} />
        </PageDialog>
      )}
      {(isModalOpen) && (
        <PageDialog onClose={() => setIsModalOpen(false)}>
<AgentModal
        title={editingAgent ? "Edit Agent" : "Add New Agent"}
        isEdit={!!editingAgent}
        formData={formData}
        setFormData={setFormData}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        mfaEnabled={editingAgent?.user?.mfa_enabled ?? false}
        isResettingMfa={isResettingMfa}
        mfaMessage={mfaMessage}
        onResetMfa={handleResetMfa}
      />
        </PageDialog>
      )}
    </>
  );
}
