import { PageDialog } from "@/components/shared/PageDialog";
import { useNewRows } from "@/lib/unseen";
import { StatCard } from "@/components/shared/StatCard";
import { Store, Receipt, BarChart3, MapPin } from "lucide-react";
import { toast } from "sonner";
import { confirmAction } from "@/lib/confirm";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useCan } from "@/hooks/useCan";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Customer, Truck, formatCustomerAddress, totalDiscountRate } from "@shared/api";
import { ExcelActionsDropdown } from "@/components/ExcelActionsDropdown";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { ExcelImportDialog } from "@/components/ExcelImportDialog";
import { ExcelColumn, exportExcelFile } from "@/lib/excel";
import { SortableHeader, SortState, compareNewestFirst, compareValues } from "@/components/SortableHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RecordTitleButton } from "@/components/RecordTitleButton";
import { TableBulkAction, TableFilterSelect, TableToolbar } from "@/components/TableToolbar";
import {
  CustomerDiscountEditor,
  DiscountRow,
  formatPercent,
} from "@/components/CustomerDiscountEditor";
import { CustomerLocationPicker } from "@/components/CustomerLocationPicker";
import { CustomerLocationMap } from "@/components/CustomerLocationMap";

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


const paymentTypeLabels: Record<NonNullable<Customer["payment_type"]>, string> = {
  cash: "Cash",
  check: "Check",
  bank_transfer: "Bank Transfer",
  cod: "Cash on Delivery",
  credit: "Credit",
};

function DetailField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function ViewCustomerPage({ customer, canEdit, onClose, onEdit }: { customer: Customer; canEdit: boolean; onClose: () => void; onEdit: () => void }) {
  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Customer Details</h1>
        </div>
      </div>
      <div className="w-full rounded-2xl border border-border bg-card">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 p-6 sm:grid-cols-2">
          <DetailField label="Store Name"><span className="font-semibold">{customer.store_name}</span></DetailField>
          <DetailField label="Delivery Address">{formatCustomerAddress(customer) || "—"}</DetailField>
          <DetailField label="Street No.">{customer.street_number || "—"}</DetailField>
          <DetailField label="Street Address">{customer.street_address || "—"}</DetailField>
          <DetailField label="City">{customer.location || "—"}</DetailField>
          <DetailField label="State / Province">{customer.state || "—"}</DetailField>
          <DetailField label="Postal Code">{customer.postal_code || "—"}</DetailField>
          <DetailField label="Coordinates">
            {customer.latitude != null && customer.longitude != null ? `${customer.latitude}, ${customer.longitude}` : "—"}
          </DetailField>
          <DetailField label="Truck District">{customer.district || "—"}</DetailField>
          <DetailField label="Contact Person">{customer.contact_person || "—"}</DetailField>
          <DetailField label="Contact Info">{customer.contact_info || "—"}</DetailField>
          <DetailField label="Payment Type">{customer.payment_type ? paymentTypeLabels[customer.payment_type] : "—"}</DetailField>
          <DetailField label="Credit Limit">{customer.credit_limit ? `₱${Number(customer.credit_limit).toLocaleString()}` : "No limit"}</DetailField>
          <DetailField label="Credit Terms">{customer.credit_terms_days ? `${customer.credit_terms_days} days` : "—"}</DetailField>
          <DetailField label="Created">{new Date(customer.created_at).toLocaleDateString()}</DetailField>
          <DetailField label="Last Updated">{new Date(customer.updated_at).toLocaleDateString()}</DetailField>
          <DetailField label="Discounts" className="sm:col-span-2">
            {customer.discounts && customer.discounts.length > 0 ? (
              <ul className="space-y-1">
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
              "—"
            )}
          </DetailField>
        </div>

        <div className="space-y-2 border-t border-border p-6">
          <div className="text-xs font-semibold text-muted-foreground">Delivery point</div>
          <CustomerLocationMap latitude={customer.latitude} longitude={customer.longitude} />
        </div>

        <div className="sticky bottom-0 bg-muted px-6 py-4 flex justify-end gap-2 border-t border-border rounded-b-2xl">
          {canEdit && <Button onClick={onEdit} variant="secondary">Edit</Button>}
          <Button onClick={onClose} variant="default">
            Close
          </Button>
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
    <div className="mx-auto w-full !max-w-xl flex-1 space-y-6 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
        </div>
      </div>
      <div className="flex w-full flex-col rounded-2xl border border-border bg-card">

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          <div>
            <label htmlFor="customers-store-name" className="mb-1 block text-xs font-semibold text-foreground">
              Store Name *
            </label>
            <Input id="customers-store-name"
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
              <label htmlFor="customers-street-no" className="mb-1 block text-xs font-semibold text-foreground">Street No.</label>
              <Input id="customers-street-no"
                type="text"
                value={formData.street_number}
                onChange={(e) => updateAddressField("street_number", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
                placeholder="e.g., 123"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="customers-street-address" className="mb-1 block text-xs font-semibold text-foreground">Street Address</label>
              <Input id="customers-street-address"
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
              <label htmlFor="customers-city" className="mb-1 block text-xs font-semibold text-foreground">City *</label>
              <Input id="customers-city"
                type="text"
                value={formData.location}
                onChange={(e) => updateAddressField("location", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
                placeholder="e.g., Makati City"
              />
            </div>
            <div>
              <label htmlFor="customers-state-province" className="mb-1 block text-xs font-semibold text-foreground">State / Province</label>
              <Input id="customers-state-province"
                type="text"
                value={formData.state}
                onChange={(e) => updateAddressField("state", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
                placeholder="e.g., Metro Manila"
              />
            </div>
            <div>
              <label htmlFor="customers-postal-code" className="mb-1 block text-xs font-semibold text-foreground">Postal Code</label>
              <Input id="customers-postal-code"
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
            <label htmlFor="customers-contact-person" className="mb-1 block text-xs font-semibold text-foreground">
              Contact Person
            </label>
            <Input id="customers-contact-person"
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
            <label htmlFor="customers-contact-info" className="mb-1 block text-xs font-semibold text-foreground">
              Contact Info
            </label>
            <Input id="customers-contact-info"
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
              <label htmlFor="customers-credit-limit" className="mb-1 block text-xs font-semibold text-foreground">Credit Limit (₱)</label>
              <Input id="customers-credit-limit"
                type="number"
                min="0"
                value={formData.credit_limit}
                onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent-2 focus:outline-none"
                placeholder="Blank = no limit"
              />
            </div>
            <div>
              <label htmlFor="customers-credit-terms-days" className="mb-1 block text-xs font-semibold text-foreground">Credit Terms (days)</label>
              <Input id="customers-credit-terms-days"
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
  const isNewRow = useNewRows("customers");
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
  const canManageCustomers = useCan("customer:manage");

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
          if (!customerSort) return compareNewestFirst(a, b);
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

  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const selectedCustomers = customers.filter((customer) => selectedCustomerIds.includes(customer.id));
  const pageIds = paginatedCustomers.map((customer) => customer.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedCustomerIds.includes(id));
  const toggleCustomerSelection = (id: string, checked: boolean) =>
    setSelectedCustomerIds((current) => (checked ? [...current, id] : current.filter((selectedId) => selectedId !== id)));
  const togglePageSelection = (checked: boolean) =>
    setSelectedCustomerIds((current) => (checked ? Array.from(new Set([...current, ...pageIds])) : current.filter((id) => !pageIds.includes(id))));

  const handleDeleteSelected = async () => {
    const noun = selectedCustomers.length === 1 ? "customer" : "customers";
    if (!(await confirmAction(`Delete ${selectedCustomers.length} selected ${noun}?`))) return;
    const ids = selectedCustomers.map((customer) => customer.id);
    try {
      await Promise.all(ids.map(async (id) => {
        const response = await fetch(`/api/customers/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error("Failed to delete customer");
      }));
    } catch {
      toast.error("Some customers could not be deleted.");
    } finally {
      setSelectedCustomerIds([]);
      await fetchCustomers();
    }
  };

  const bulkActions: TableBulkAction[] = [
    ...(selectedCustomers.length === 1
      ? [
          { label: "View customer", onSelect: () => setViewingCustomer(selectedCustomers[0]) },
          ...(canManageCustomers
            ? [{ label: "Edit customer", onSelect: () => openEditModal(selectedCustomers[0]) }]
            : []),
        ]
      : []),
    ...(canManageCustomers
      ? [{ label: `Delete selected ${selectedCustomers.length === 1 ? "customer" : "customers"}`, onSelect: () => void handleDeleteSelected(), destructive: true }]
      : []),
  ];

  if (isLoading) {
    return (
      <div className="flex-1 px-4 py-4 md:px-6 md:py-6">
        <LoadingSpinner className="min-h-64" />
      </div>
    );
  }






  return (
    <>

    <div className="flex-1 flex flex-col gap-6 p-6 overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Customer Management</h1>
          <p className="page-subtitle">Manage customer stores, contacts, and discount settings</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageCustomers && (
            <Button onClick={openAddModal} variant="default">
              Add Customer
            </Button>
          )}
          <ExcelActionsDropdown
            onImport={canManageCustomers ? () => setShowExcelImport(true) : undefined}
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
        <StatCard label="Total Customers" value={customers.length.toString()} icon={Store} />
        <StatCard
          label="Avg Discount"
          value={`${formatPercent(averageDiscountRate)}%`} icon={Receipt}
        />
        <StatCard
          label="With Discounts"
          value={customers.filter((customer) => (customer.discounts?.length ?? 0) > 0).length.toString()} icon={BarChart3}
        />
        <StatCard label="Districts" value={customerDistricts.length.toString()} icon={MapPin} />
      </div>

      <TableToolbar
        selectedCount={selectedCustomers.length}
        bulkActions={bulkActions}
        searchValue={searchQuery}
        onSearchChange={(value) => { setSearchQuery(value); setCurrentPage(1); }}
        searchPlaceholder="Search by store, location, or contact person…"
      >
        <TableFilterSelect label="District" value={districtFilter} onChange={(value) => { setDistrictFilter(value); setCurrentPage(1); }}>
          <option value="">All districts</option>
          {customerDistricts.map((district) => (
            <option key={district} value={district}>{district}</option>
          ))}
        </TableFilterSelect>
      </TableToolbar>

      <div className="data-table-frame overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-3 py-3">
                  <input aria-label="Select all customers on this page" type="checkbox" checked={allPageSelected} onChange={(event) => togglePageSelection(event.target.checked)} />
                </TableHead>
                <SortableHeader label="Store Name" sortKey="store" sort={customerSort} onSort={setCustomerSort} />
                <SortableHeader label="Delivery Address" sortKey="address" sort={customerSort} onSort={setCustomerSort} />
                <SortableHeader label="Contact Person" sortKey="contact" sort={customerSort} onSort={setCustomerSort} className="hidden md:table-cell" />
                <SortableHeader label="Contact Info" sortKey="contactInfo" sort={customerSort} onSort={setCustomerSort} className="hidden md:table-cell" />
                <SortableHeader label="District" sortKey="district" sort={customerSort} onSort={setCustomerSort} />
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
                    className={isNewRow(customer.created_at) ? "row-new" : undefined}
                  >
                    <TableCell className="px-3 py-3">
                      <input aria-label={`Select ${customer.store_name}`} type="checkbox" checked={selectedCustomerIds.includes(customer.id)} onChange={(event) => toggleCustomerSelection(customer.id, event.target.checked)} />
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <RecordTitleButton onClick={() => setViewingCustomer(customer)}>{customer.store_name}</RecordTitleButton>
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
              disabled={currentPage === totalPages}
              variant="outline" size="sm"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Total customers: {filteredCustomers.length}
      </div>

    </div>
  
      {(isModalOpen) && (
        <PageDialog onClose={() => setIsModalOpen(false)}>
<CustomerModal
        title={editingCustomer ? "Edit Customer" : "Add New Customer"}
        formData={formData}
        setFormData={setFormData}
        districts={truckDistricts}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
      />
        </PageDialog>
      )}
      {(viewingCustomer) && (
        <PageDialog onClose={() => setViewingCustomer(null)}>
          <ViewCustomerPage
            customer={viewingCustomer}
            canEdit={canManageCustomers}
            onClose={() => setViewingCustomer(null)}
            onEdit={() => {
              setViewingCustomer(null);
              openEditModal(viewingCustomer);
            }}
          />
        </PageDialog>
      )}
      {(showExcelImport) && (
        <PageDialog onClose={() => setShowExcelImport(false)}>
<ExcelImportDialog
        title="Customers"
        columns={customerExcelColumns}
        validateRow={validateCustomerImportRow}
        onImport={importCustomerRows}
        onClose={() => setShowExcelImport(false)}
      />
        </PageDialog>
      )}
    </>
  );
}
