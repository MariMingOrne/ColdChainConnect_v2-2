import { toast } from "sonner";
import { confirmAction } from "@/lib/confirm";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Customer, Truck, formatCustomerAddress, totalDiscountRate } from "@shared/api";
import { ArrowLeft, Search } from "lucide-react";
import { ExcelActionsDropdown } from "@/components/ExcelActionsDropdown";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { ExcelImportDialog } from "@/components/ExcelImportDialog";
import { ExcelColumn, exportExcelFile } from "@/lib/excel";
import { SortableHeader, SortState, compareValues } from "@/components/SortableHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionButtons } from "@/components/ActionButtons";
import {
  CustomerDiscountEditor,
  DiscountRow,
  formatPercent,
} from "@/components/CustomerDiscountEditor";
import { CustomerLocationPicker } from "@/components/CustomerLocationPicker";

interface CustomersProps {
  onBack?: () => void;
}

interface CustomerForm {
  store_name: string;
  street_number: string;
  street_address: string;
  location: string;
  district: string;
  state: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
  contact_person: string;
  contact_info: string;
  credit_limit: string;
  credit_terms_days: string;
  discounts: DiscountRow[];
}

const customerExcelColumns: ExcelColumn[] = [
  { header: "Store Name", key: "store_name", required: true, width: 28 },
  { header: "City", key: "location", required: true, width: 20 },
  { header: "Street No.", key: "street_number", width: 14 },
  { header: "Street Address", key: "street_address", width: 30 },
  { header: "Truck District", key: "district", width: 20 },
  { header: "State / Province", key: "state", width: 22 },
  { header: "Postal Code", key: "postal_code", width: 14 },
  { header: "Latitude", key: "latitude", width: 14 },
  { header: "Longitude", key: "longitude", width: 14 },
  { header: "Contact Person", key: "contact_person", width: 22 },
  { header: "Contact Info", key: "contact_info", width: 22 },
  { header: "Payment Type", key: "payment_type", width: 16 },
  { header: "Credit Limit", key: "credit_limit", width: 14 },
  { header: "Credit Terms Days", key: "credit_terms_days", width: 18 },
  { header: "Discounts JSON", key: "discounts_json", width: 42 },
];

function StatsBox({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: string;
  color?: string;
}) {
  const colorClass = color ? `text-${color}` : "text-accent-2";

  return (
    <div className="bg-card border border-border rounded-lg p-3 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`font-rajdhani text-xl font-bold ${colorClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function ViewCustomerPage({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Customer Details</h1>
        </div>
        <button onClick={onClose} className="btn-ghost">
          <ArrowLeft size={15} />
          Back
        </button>
      </div>
      <div className="max-w-lg w-full rounded-2xl border border-border bg-card">

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Store Name</label>
            <div className="text-sm text-foreground font-semibold">{customer.store_name}</div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Delivery Address</label>
            <div className="text-sm text-foreground">{formatCustomerAddress(customer) || "—"}</div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Truck District</label>
            <div className="text-sm text-foreground">{customer.district || "—"}</div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Contact Person</label>
            <div className="text-sm text-foreground">{customer.contact_person || "—"}</div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Contact Info</label>
            <div className="text-sm text-foreground">{customer.contact_info || "—"}</div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Discounts</label>
            {customer.discounts && customer.discounts.length > 0 ? (
              <ul className="space-y-1 text-sm text-foreground">
                {customer.discounts.map((discount) => (
                  <li key={discount.id ?? discount.label}>
                    {discount.label}: {formatPercent(Number(discount.rate))}%
                  </li>
                ))}
                <li className="font-semibold">
                  Total: {formatPercent(totalDiscountRate(customer.discounts))}%
                </li>
              </ul>
            ) : (
              <div className="text-sm text-foreground">—</div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-muted px-6 py-4 flex justify-end border-t border-border rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold text-sm hover:opacity-90">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerModal({
  title,
  formData,
  setFormData,
  districts,
  onClose,
  onSave,
}: {
  title: string;
  formData: CustomerForm;
  setFormData: (data: CustomerForm) => void;
  districts: string[];
  onClose: () => void;
  onSave: () => void;
}) {
  const districtOptions =
    formData.district && !districts.includes(formData.district)
      ? [...districts, formData.district]
      : districts;
  const updateAddressField = (field: "street_number" | "street_address" | "location" | "state" | "postal_code", value: string) =>
    setFormData({ ...formData, [field]: value, latitude: null, longitude: null });
  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
        </div>
        <button onClick={onClose} className="btn-ghost">
          <ArrowLeft size={15} />
          Back
        </button>
      </div>
      <div className="flex w-full max-w-xl flex-col rounded-2xl border border-border bg-card">

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          <div>
            <label className="mb-1 block text-xs font-semibold text-foreground">
              Store Name *
            </label>
            <Input
              type="text"
              value={formData.store_name}
              onChange={(e) =>
                setFormData({ ...formData, store_name: e.target.value })
              }
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
              placeholder="e.g., ABC Market - Makati"
            />
          </div>

          <CustomerLocationPicker
            position={{ latitude: formData.latitude, longitude: formData.longitude }}
            onSelect={(details) => setFormData({ ...formData, ...details })}
          />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">Street No.</label>
              <Input
                type="text"
                value={formData.street_number}
                onChange={(e) => updateAddressField("street_number", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
                placeholder="e.g., 123"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-foreground">Street Address</label>
              <Input
                type="text"
                value={formData.street_address}
                onChange={(e) => updateAddressField("street_address", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
                placeholder="e.g., Ayala Avenue"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="mb-1 block text-xs font-semibold text-foreground">City *</label>
              <Input
                type="text"
                value={formData.location}
                onChange={(e) => updateAddressField("location", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
                placeholder="e.g., Makati City"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">State / Province</label>
              <Input
                type="text"
                value={formData.state}
                onChange={(e) => updateAddressField("state", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
                placeholder="e.g., Metro Manila"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">Postal Code</label>
              <Input
                type="text"
                value={formData.postal_code}
                onChange={(e) => updateAddressField("postal_code", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
                placeholder="e.g., 1226"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-foreground">Truck District</label>
            <Select
              value={formData.district || undefined}
              onValueChange={(district) => setFormData({ ...formData, district })}
            >
              <SelectTrigger aria-label="Truck district" className="w-full">
                <SelectValue placeholder="No district" />
              </SelectTrigger>
              <SelectContent>
                {districtOptions.map((district) => (
                  <SelectItem key={district} value={district}>{district}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Approved orders for this customer are dispatched to the truck serving this district.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-foreground">
              Contact Person
            </label>
            <Input
              type="text"
              value={formData.contact_person}
              onChange={(e) =>
                setFormData({ ...formData, contact_person: e.target.value })
              }
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
              placeholder="e.g., Juan Dela Cruz"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-foreground">
              Contact Info
            </label>
            <Input
              type="text"
              value={formData.contact_info}
              onChange={(e) =>
                setFormData({ ...formData, contact_info: e.target.value })
              }
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
              placeholder="e.g., 555-0001"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">Credit Limit (₱)</label>
              <Input
                type="number"
                min="0"
                value={formData.credit_limit}
                onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
                placeholder="Blank = no limit"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">Credit Terms (days)</label>
              <Input
                type="number"
                min="1"
                max="365"
                value={formData.credit_terms_days}
                onChange={(e) => setFormData({ ...formData, credit_terms_days: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-foreground">Discounts</label>
            <CustomerDiscountEditor
              rows={formData.discounts}
              onChange={(discounts) => setFormData({ ...formData, discounts })}
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 rounded-b-2xl border-t border-border bg-muted px-6 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="accent" onClick={onSave}>Save Customer</Button>
        </div>
      </div>
    </div>
  );
}

export function Customers({ onBack }: CustomersProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [customerSort, setCustomerSort] = useState<SortState<"store" | "address" | "contact" | "contactInfo" | "district">>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [truckDistricts, setTruckDistricts] = useState<string[]>([]);
  const [formData, setFormData] = useState<CustomerForm>({
    store_name: "",
    street_number: "",
    street_address: "",
    location: "",
    district: "",
    state: "",
    postal_code: "",
    latitude: null,
    longitude: null,
    contact_person: "",
    contact_info: "",
    credit_limit: "",
    credit_terms_days: "30",
    discounts: [],
  });
  const { token } = useAuth();

  const itemsPerPage = 10;

  const fetchCustomers = async () => {
    try {
      const response = await fetch("/api/customers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch customers");
      const data = (await response.json()) as Customer[];
      setCustomers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading customers");
    } finally {
      setIsLoading(false);
    }
  };

  const validateCustomerImportRow = (row: Record<string, unknown>) => {
    const storeName = String(row.store_name ?? "").trim();
    const location = String(row.location ?? "").trim();
    const errors = [];
    if (!storeName || !location) errors.push("Store name and city are required");
    if (customers.some((customer) => customer.store_name.toLowerCase() === storeName.toLowerCase() && customer.location.toLowerCase() === location.toLowerCase())) {
      errors.push("Store and city already exist");
    }
    return errors;
  };

  const importCustomerRows = async (rows: Record<string, unknown>[]) => {
    const response = await fetch("/api/customers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rows }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Customer import failed.");
    await fetchCustomers();
  };

  const handleCustomerExport = async () => {
    await exportExcelFile("customers.xlsx", "Customers", customerExcelColumns, customers.map((customer) => ({
      store_name: customer.store_name,
      location: customer.location,
      street_number: customer.street_number ?? "",
      street_address: customer.street_address ?? "",
      district: customer.district ?? "",
      state: customer.state ?? "",
      postal_code: customer.postal_code ?? "",
      latitude: customer.latitude ?? "",
      longitude: customer.longitude ?? "",
      contact_person: customer.contact_person ?? "",
      contact_info: customer.contact_info ?? "",
      payment_type: customer.payment_type ?? "",
      credit_limit: customer.credit_limit ? Number(customer.credit_limit) : "",
      credit_terms_days: customer.credit_terms_days ?? 30,
      discounts_json: JSON.stringify((customer.discounts ?? []).map(({ label, rate }) => ({ label, rate: Number(rate) }))),
    })));
  };

  useEffect(() => {
    if (!token) return;
    fetchCustomers();
    fetch("/api/trucks", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((trucks: Truck[]) => setTruckDistricts([...new Set(trucks.map((t) => t.district))].sort()))
      .catch(() => setTruckDistricts([]));
  }, [token]);
  useAutoRefresh(fetchCustomers, { enabled: Boolean(token) });

  const customerDistricts = useMemo(
    () => [...new Set(customers.map((c) => c.district).filter((d): d is string => Boolean(d)))].sort(),
    [customers]
  );

  const filteredCustomers = useMemo(
    () =>
      customers
        .filter(
          (customer) =>
            (customer.store_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              customer.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              customer.contact_person?.toLowerCase().includes(searchQuery.toLowerCase())) &&
            (!districtFilter || customer.district === districtFilter)
        )
        .sort((a, b) => {
          if (!customerSort) return 0;
          const direction = customerSort.direction === "asc" ? 1 : -1;
          const value = (c: Customer) => ({ store: c.store_name, address: formatCustomerAddress(c), contact: c.contact_person, contactInfo: c.contact_info, district: c.district })[customerSort.key];
          return compareValues(value(a), value(b)) * direction;
        }),
    [customers, searchQuery, districtFilter, customerSort]
  );

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);

  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const averageDiscountRate =
    customers.length > 0
      ? customers.reduce((sum, customer) => sum + totalDiscountRate(customer.discounts), 0) /
        customers.length
      : 0;

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormData({
      store_name: "",
      street_number: "",
      street_address: "",
      location: "",
      district: "",
      state: "",
      postal_code: "",
    latitude: null,
    longitude: null,
    contact_person: "",
      contact_info: "",
      credit_limit: "",
      credit_terms_days: "30",
      discounts: [],
    });
    setIsModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      store_name: customer.store_name,
      street_number: customer.street_number ?? "",
      street_address: customer.street_address ?? "",
      location: customer.location,
      district: customer.district ?? "",
      state: customer.state ?? "",
      postal_code: customer.postal_code ?? "",
      latitude: customer.latitude ?? null,
      longitude: customer.longitude ?? null,
      contact_person: customer.contact_person ?? "",
      contact_info: customer.contact_info ?? "",
      credit_limit: customer.credit_limit ?? "",
      credit_terms_days: String(customer.credit_terms_days ?? 30),
      discounts: (customer.discounts ?? []).map((discount) => ({
        label: discount.label,
        percent: String(Number(discount.rate) * 100),
      })),
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.store_name.trim() || !formData.location.trim()) return;

    try {
      const url = editingCustomer
        ? `/api/customers/${editingCustomer.id}`
        : "/api/customers";
      const method = editingCustomer ? "PATCH" : "POST";

      const discounts = formData.discounts
        .filter((discount) => discount.label.trim() && Number(discount.percent) > 0)
        .map((discount) => ({
          label: discount.label.trim(),
          rate: Number(discount.percent) / 100,
        }));

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          store_name: formData.store_name,
          street_number: formData.street_number || undefined,
          street_address: formData.street_address || undefined,
          location: formData.location,
          district: formData.district || undefined,
          state: formData.state || undefined,
          postal_code: formData.postal_code || undefined,
          latitude: formData.latitude,
          longitude: formData.longitude,
          contact_person: formData.contact_person || undefined,
          contact_info: formData.contact_info || undefined,
          credit_limit: formData.credit_limit.trim() === "" ? null : Number(formData.credit_limit),
          credit_terms_days: Number(formData.credit_terms_days),
          discounts,
        }),
      });

      if (!response.ok) throw new Error("Failed to save customer");

      const saved = (await response.json()) as Customer;

      if (editingCustomer) {
        setCustomers(customers.map((customer) => (customer.id === saved.id ? saved : customer)));
      } else {
        setCustomers((current) => [saved, ...current]);
      }

      setIsModalOpen(false);
    } catch {
      toast.error("Failed to save customer");
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction("Delete this customer?"))) return;

    try {
      await fetch(`/api/customers/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setCustomers(customers.filter((customer) => customer.id !== id));
    } catch {
      toast.error("Failed to delete customer");
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 px-4 py-4 md:px-6 md:py-6">
        <LoadingSpinner className="min-h-64" />
      </div>
    );
  }

  if (isModalOpen) {
    return (
      <CustomerModal
        title={editingCustomer ? "Edit Customer" : "Add New Customer"}
        formData={formData}
        setFormData={setFormData}
        districts={truckDistricts}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
      />
    );
  }

  if (viewingCustomer) {
    return <ViewCustomerPage customer={viewingCustomer} onClose={() => setViewingCustomer(null)} />;
  }
  if (showExcelImport) {
    return (
      <ExcelImportDialog
        title="Customers"
        columns={customerExcelColumns}
        validateRow={validateCustomerImportRow}
        onImport={importCustomerRows}
        onClose={() => setShowExcelImport(false)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Customer Management</h1>
          <p className="page-subtitle">Manage customer stores, contacts, and discount settings</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={openAddModal} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
            ➕ Add Customer
          </button>
          <ExcelActionsDropdown
            onImport={() => setShowExcelImport(true)}
            onExport={handleCustomerExport}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-red">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatsBox label="Total Customers" value={customers.length.toString()} icon="🏪" />
        <StatsBox
          label="Avg Discount"
          value={`${formatPercent(averageDiscountRate)}%`}
          icon="🧾"
        />
        <StatsBox
          label="With Discounts"
          value={customers.filter((customer) => (customer.discounts?.length ?? 0) > 0).length.toString()}
          icon="📊"
          color="gold"
        />
      </div>

      <div className="flex flex-wrap items-center justify-start gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by store, location, or contact person…"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-4 text-sm focus:border-accent-2 focus:outline-none"
          />
        </div>
        <select
          aria-label="District"
          value={districtFilter}
          onChange={(event) => {
            setDistrictFilter(event.target.value);
            setCurrentPage(1);
          }}
          className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground focus:border-accent-2 focus:outline-none"
        >
          <option value="">All districts</option>
          {customerDistricts.map((district) => (
            <option key={district} value={district}>{district}</option>
          ))}
        </select>
      </div>

      <div className="data-table-frame overflow-hidden">
        <div className="overflow-x-auto text-xs md:text-sm">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <SortableHeader label="Store Name" sortKey="store" sort={customerSort} onSort={setCustomerSort} />
                <SortableHeader label="Delivery Address" sortKey="address" sort={customerSort} onSort={setCustomerSort} />
                <SortableHeader label="Contact Person" sortKey="contact" sort={customerSort} onSort={setCustomerSort} className="hidden md:table-cell" />
                <SortableHeader label="Contact Info" sortKey="contactInfo" sort={customerSort} onSort={setCustomerSort} className="hidden md:table-cell" />
                <SortableHeader label="District" sortKey="district" sort={customerSort} onSort={setCustomerSort} />
                <TableHead style={{ width: '120px' }} className="sticky right-0 z-10 border-b border-border bg-navy-mid px-3 py-3 text-center font-barlow-cond text-xs font-bold text-muted-foreground whitespace-nowrap shadow-left">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    {customers.length === 0
                      ? "No customers found"
                      : "No results matching your search"}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCustomers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className="border-b border-border transition-colors hover:bg-accent/50"
                  >
                    <TableCell className="px-3 py-3 font-semibold text-foreground">
                      {customer.store_name}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-foreground">{formatCustomerAddress(customer)}</TableCell>
                    <TableCell className="hidden px-3 py-3 text-foreground md:table-cell">
                      {customer.contact_person || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden px-3 py-3 text-foreground md:table-cell">
                      {customer.contact_info || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="px-3 py-3 whitespace-nowrap text-foreground">
                      {customer.district || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell style={{ width: '120px' }} className="sticky right-0 z-10 px-3 py-3 bg-card border-l border-border shadow-left">
                      <ActionButtons
                        onView={() => setViewingCustomer(customer)}
                        onEdit={() => openEditModal(customer)}
                        onDelete={() => handleDelete(customer.id)}
                        showDelete
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination - Always Display */}
        <div className="flex items-center justify-between border-t border-border bg-muted/50 px-6 py-4">
          <div className="text-xs text-muted-foreground">
            Page {currentPage} of {Math.max(1, totalPages)} · {filteredCustomers.length} customers
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-border rounded text-xs font-semibold hover:bg-card disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span className="px-3 py-1 text-xs font-semibold text-foreground bg-card rounded border border-border">
              {currentPage}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-border rounded text-xs font-semibold hover:bg-card disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Total customers: {filteredCustomers.length}
      </div>

    </div>
  );
}
