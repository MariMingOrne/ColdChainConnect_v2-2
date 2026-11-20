import { MIN_PASSWORD_LENGTH } from "@shared/api";
import { PageDialog } from "@/components/shared/PageDialog";
import { toast } from "sonner";
import { confirmAction } from "@/lib/confirm";
import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useCan } from "@/hooks/useCan";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Archive, ArchiveRestore } from "lucide-react";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Driver } from "@shared/api";
import { DriverScheduleModal } from "@/components/driver/DriverScheduleModal";

interface DriversProps {
  onBack?: () => void;
}

interface DriverForm {
  full_name: string;
  contact_info: string;
  license: string;
  hire_date: string;
  employment_type: "full_time" | "part_time" | "";
  is_active: boolean;
  username: string;
  password: string;
}

// ─── View Modal ───────────────────────────────────────────────────────────────

function ViewDriverModal({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  return (
    <div className="flex-1 p-6 space-y-6 mx-auto w-full max-w-2xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Driver Details</h1>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border">

        <div className="p-6 space-y-4">
          {[
            ["Full Name", driver.full_name],
            ["Contact Info", driver.contact_info],
            ["License", driver.license],
            ["Hire Date", driver.hire_date],
            ["Employment Type", driver.employment_type?.replace("_", " ")],
            ["Login Username", driver.user?.username],
          ].map(([label, value]) => (
            <div key={label as string}>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">{label}</label>
              <div className="text-sm text-foreground font-medium capitalize">{value || "—"}</div>
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Status</label>
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${driver.is_active ? "badge-green" : "badge-red"}`}>
              {driver.is_active ? "Active" : "Inactive"}
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

function DriverModal({
  title,
  formData,
  setFormData,
  hasLogin,
  mfaEnabled,
  isResettingMfa,
  mfaMessage,
  onClose,
  onSave,
  onResetMfa,
}: {
  title: string;
  formData: DriverForm;
  setFormData: (data: DriverForm) => void;
  hasLogin: boolean;
  mfaEnabled: boolean;
  isResettingMfa: boolean;
  mfaMessage: string | null;
  onClose: () => void;
  onSave: () => void;
  onResetMfa: () => void;
}) {
  const field = (
    label: string,
    key: keyof DriverForm,
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
    <div className="flex-1 p-6 space-y-6 mx-auto w-full max-w-2xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border">

        <div className="p-6 space-y-4">
          {field("Full Name *", "full_name", "e.g., Juan Dela Cruz")}
          {field("Contact Info", "contact_info", "e.g., 09171234567")}
          {field("License Number", "license", "e.g., N01-23-456789")}
          {field("Hire Date", "hire_date", "", "date")}

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Employment Type</label>
            <Select
              value={formData.employment_type || undefined}
              onValueChange={(employment_type) => setFormData({ ...formData, employment_type: employment_type as DriverForm["employment_type"] })}
            >
              <SelectTrigger aria-label="Employment type">
                <SelectValue placeholder="Select employment type…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">Full Time</SelectItem>
                <SelectItem value="part_time">Part Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-border pt-4 space-y-4">
            <p className="text-xs font-bold text-muted-foreground">Login</p>
            {field("Username", "username", "e.g., juan.delacruz")}
            {field(
              "Password",
              "password",
              hasLogin ? "Leave blank to keep current password" : `At least ${MIN_PASSWORD_LENGTH} characters`,
              "password"
            )}
            <p className="text-xs text-muted-foreground">
              Drivers sign in with these details and set up an authenticator app on first login.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 accent-navy"
            />
            <label htmlFor="is_active" className="text-sm font-semibold text-foreground">Active Driver</label>
          </div>

          {hasLogin && (
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
          <Button type="button" variant="accent" onClick={onSave}>Save Driver</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Driver Card ──────────────────────────────────────────────────────────────

function DriverCard({
  driver,
  showArchive,
  onView,
  onEdit,
  onSchedule,
  onArchive,
  canManageMfa,
  isSavingMfa,
  onMfaRequirementChange,
}: {
  driver: Driver;
  showArchive: boolean;
  onView: () => void;
  onEdit?: () => void;
  onSchedule: () => void;
  onArchive: () => void;
  canManageMfa: boolean;
  isSavingMfa: boolean;
  onMfaRequirementChange: (required: boolean) => void;
}) {
  const initials = (driver.full_name || "?")
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
            {driver.full_name || "—"}
          </div>
          <div className="text-xs text-muted-foreground truncate">{driver.license || "No license"}</div>
        </div>
        <span className={`shrink-0 inline-block px-2 py-0.5 rounded text-xs font-bold ${driver.is_active ? "badge-green" : "badge-red"}`}>
          {driver.is_active ? "Active" : "Inactive"}
        </span>
        {driver.is_archived && <span className="rounded bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">Archived</span>}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="min-w-0">
          <span className="text-muted-foreground block">Contact</span>
          <span className="block truncate text-foreground font-medium">{driver.contact_info || "—"}</span>
        </div>
        <div className="min-w-0">
          <span className="text-muted-foreground block">Employment</span>
          <span className="block truncate text-foreground font-medium capitalize">{driver.employment_type?.replace("_", " ") || "—"}</span>
        </div>
        <div className="min-w-0">
          <span className="text-muted-foreground block">Hired</span>
          <span className="block truncate text-foreground font-medium">{driver.hire_date || "—"}</span>
        </div>
        <div className="min-w-0">
          <span className="text-muted-foreground block">Login</span>
          <span className="block truncate text-foreground font-medium">{driver.user?.username || "No login"}</span>
        </div>
      </div>

      {canManageMfa && driver.user && (
        <label className="flex items-center justify-between gap-3 border-t border-border pt-2 text-xs font-semibold text-foreground">
          <span>Require MFA at sign-in</span>
          <input type="checkbox" checked={driver.user.mfa_required} disabled={isSavingMfa} onChange={(event) => onMfaRequirementChange(event.target.checked)} className="h-4 w-4 accent-navy" />
        </label>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
        <Button onClick={onView} variant="outline" size="sm" className="min-w-0">View</Button>
        <Button onClick={onSchedule} variant="outline" size="sm" className="min-w-0">Schedule</Button>
        {onEdit && <Button onClick={onEdit} variant="outline" size="sm" className="min-w-0">Edit</Button>}
        {showArchive && (
          <Button onClick={onArchive} variant={driver.is_archived ? "outline" : "danger"} size="sm" className="min-w-0">
            {driver.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {driver.is_archived ? "Restore" : "Archive"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Drivers({ onBack, onCreateAccount }: DriversProps & { onCreateAccount?: () => void }) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [viewingDriver, setViewingDriver] = useState<Driver | null>(null);
  const [schedulingDriver, setSchedulingDriver] = useState<Driver | null>(null);
  const [isResettingMfa, setIsResettingMfa] = useState(false);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);
  const [mfaSavingDriverId, setMfaSavingDriverId] = useState<string | null>(null);
  const { token } = useAuth();
  const canManageDrivers = useCan("driver:manage");

  const emptyForm = (): DriverForm => ({
    full_name: "",
    contact_info: "",
    license: "",
    hire_date: "",
    employment_type: "",
    is_active: true,
    username: "",
    password: "",
  });

  const [formData, setFormData] = useState<DriverForm>(emptyForm());
  const itemsPerPage = 12;

  const fetchDrivers = async () => {
    try {
      const response = await fetch("/api/drivers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch drivers");
      setDrivers(await response.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading drivers");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchDrivers();
  }, [token]);

  const filteredDrivers = drivers.filter(
    (d) =>
      ((d.full_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.contact_info?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.license?.toLowerCase().includes(searchQuery.toLowerCase()))) &&
      (showArchived ? d.is_archived : !d.is_archived) &&
      (statusFilter === "all" || (statusFilter === "active" ? d.is_active : !d.is_active))
  );

  const totalPages = Math.ceil(filteredDrivers.length / itemsPerPage);
  const paginatedDrivers = filteredDrivers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const openAddModal = () => {
    setEditingDriver(null);
    setFormData(emptyForm());
    setIsModalOpen(true);
  };

  const openEditModal = (driver: Driver) => {
    setEditingDriver(driver);
    setMfaMessage(null);
    setFormData({
      full_name: driver.full_name ?? "",
      contact_info: driver.contact_info ?? "",
      license: driver.license ?? "",
      hire_date: driver.hire_date ?? "",
      employment_type: (driver.employment_type as any) ?? "",
      is_active: driver.is_active ?? true,
      username: driver.user?.username ?? "",
      password: "",
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (!formData.full_name) {
        toast.error("Full name is required");
        return;
      }

      if (editingDriver) {
        const res = await fetch(`/api/drivers/${editingDriver.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            full_name: formData.full_name,
            contact_info: formData.contact_info,
            license: formData.license,
            hire_date: formData.hire_date,
            employment_type: formData.employment_type || undefined,
            is_active: formData.is_active,
            username: formData.username || undefined,
            password: formData.password || undefined,
          }),
        });
        if (!res.ok) throw new Error("Failed to update driver");
        const saved = await res.json();
        setDrivers(drivers.map((d) => (d.id === saved.id ? saved : d)));
      } else {
        const res = await fetch("/api/drivers", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            full_name: formData.full_name,
            contact_info: formData.contact_info,
            license: formData.license,
            hire_date: formData.hire_date,
            employment_type: formData.employment_type || undefined,
            username: formData.username || undefined,
            password: formData.password || undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create driver");
        }
        const created = await res.json();
        setDrivers((current) => [created, ...current]);
      }
      setIsModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save driver");
    }
  };

  const updateDriverMfaRequirement = async (driver: Driver, required: boolean) => {
    if (!driver.user) return;
    setMfaSavingDriverId(driver.id);
    try {
      const response = await fetch(`/api/users/${driver.user.id}/mfa-required`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mfa_required: required }),
      });
      if (!response.ok) throw new Error("Failed to update MFA requirement");
      setDrivers((current) => current.map((item) => item.id === driver.id && item.user ? { ...item, user: { ...item.user, mfa_required: required } } : item));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update MFA requirement");
    } finally {
      setMfaSavingDriverId(null);
    }
  };

  const handleResetMfa = async () => {
    const userId = editingDriver?.user?.id;
    if (!userId) return;
    const username = editingDriver?.user?.username;
    if (!(await confirmAction(`Reset MFA for ${username}? They will need to set up their authenticator app again at next sign-in.`))) return;

    setIsResettingMfa(true);
    setMfaMessage(null);
    try {
      const res = await fetch(`/api/users/${userId}/mfa/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to reset MFA");
      }
      const clearMfa = (d: Driver): Driver =>
        d.user && d.user.id === userId ? { ...d, user: { ...d.user, mfa_enabled: false } } : d;
      setDrivers((prev) => prev.map(clearMfa));
      setEditingDriver((prev) => (prev ? clearMfa(prev) : prev));
      setMfaMessage("MFA reset. The next sign-in will ask them to set up a new authenticator.");
    } catch (err) {
      setMfaMessage(err instanceof Error ? err.message : "Failed to reset MFA");
    } finally {
      setIsResettingMfa(false);
    }
  };

  const updateArchiveStatus = async (driver: Driver) => {
    const archived = !driver.is_archived;
    const name = driver.full_name || driver.user?.username || "this driver";
    const prompt = archived
      ? `Archive ${name}? Their profile will be hidden and any linked login disabled.`
      : `Restore ${name}? Their linked login will be re-enabled.`;
    if (!(await confirmAction(prompt))) return;
    try {
      const response = await fetch(`/api/drivers/${driver.id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_archived: archived }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Could not update driver archive status");
      setDrivers((current) => current.map((item) => item.id === driver.id ? body as Driver : item));
      toast.success(`${name} ${archived ? "archived" : "restored"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update driver archive status");
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-rajdhani text-3xl font-bold text-foreground">
            Driver Management
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Manage field drivers</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageDrivers && (
            <>
              <Button type="button" variant="outline" onClick={() => { setShowArchived((current) => !current); setCurrentPage(1); }}>
                {showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                {showArchived ? "Active Accounts" : `Archived Accounts (${drivers.filter((driver) => driver.is_archived).length})`}
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

      <SearchFilterBar
        searchTerm={searchQuery}
        onSearchChange={(value) => { setSearchQuery(value); setCurrentPage(1); }}
        placeholder="Search by name, contact, license…"
        className="!flex-none"
        filters={[{ name: "Status", value: statusFilter, onChange: (value) => { setStatusFilter(value); setCurrentPage(1); }, options: [{ label: "All Status", value: "all" }, { label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }] }]}
      />

      {paginatedDrivers.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-12">
          {showArchived ? "No archived drivers match your search" : drivers.length === 0 ? "No drivers found" : "No results matching your search"}
        </div>
      ) : (
        <div className="grid flex-1 content-start grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 stagger-children">
          {paginatedDrivers.map((driver) => (
            <DriverCard
              key={driver.id}
              driver={driver}
              showArchive={canManageDrivers}
              onView={() => setViewingDriver(driver)}
              onEdit={canManageDrivers ? () => openEditModal(driver) : undefined}
              onSchedule={() => setSchedulingDriver(driver)}
              onArchive={() => void updateArchiveStatus(driver)}
              canManageMfa={canManageDrivers}
              isSavingMfa={mfaSavingDriverId === driver.id}
              onMfaRequirementChange={(required) => void updateDriverMfaRequirement(driver, required)}
            />
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between px-2 py-2">
        <div className="text-xs text-muted-foreground">
          Page {currentPage} of {Math.max(1, totalPages)} · {filteredDrivers.length} {showArchived ? "archived " : ""}drivers
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
  
      {(schedulingDriver) && (
        <PageDialog onClose={() => setSchedulingDriver(null)}>
<DriverScheduleModal driver={schedulingDriver} onClose={() => setSchedulingDriver(null)} />
        </PageDialog>
      )}
      {(viewingDriver) && (
        <PageDialog onClose={() => setViewingDriver(null)}>
<ViewDriverModal driver={viewingDriver} onClose={() => setViewingDriver(null)} />
        </PageDialog>
      )}
      {(isModalOpen) && (
        <PageDialog onClose={() => setIsModalOpen(false)}>
<DriverModal
        title={editingDriver ? "Edit Driver" : "Add New Driver"}
        formData={formData}
        setFormData={setFormData}
        hasLogin={Boolean(editingDriver?.user)}
        mfaEnabled={editingDriver?.user?.mfa_enabled ?? false}
        isResettingMfa={isResettingMfa}
        mfaMessage={mfaMessage}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        onResetMfa={handleResetMfa}
      />
        </PageDialog>
      )}
    </>
  );
}
