import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Boxes,
  ChartNoAxesCombined,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  TriangleAlert,
  Users,
} from "lucide-react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ExcelColumn, exportExcelFile } from "@/lib/excel";
import { exportPdfFile } from "@/lib/pdf";
import type {
  ReportCustomerRow,
  ReportProductPerformance,
  ReportSalesPeriod,
  ReportSalesResponse,
  ReportStockRow,
} from "@shared/api";

type ReportTab = "overview" | "sales" | "inventory" | "customers" | "products" | "profit";
type ReportRow = ReportSalesPeriod | ReportStockRow | ReportCustomerRow | ReportProductPerformance;
type ReportData = {
  sales: ReportSalesResponse;
  stock: ReportStockRow[];
  customers: ReportCustomerRow[];
  ranged: boolean;
};

const getValue = (row: ReportRow, key: string) => (row as unknown as Record<string, string | number>)[key];

const tabs: { id: ReportTab; label: string; icon: typeof FileBarChart }[] = [
  { id: "overview", label: "Executive summary", icon: ChartNoAxesCombined },
  { id: "sales", label: "Sales", icon: FileBarChart },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "customers", label: "Customers", icon: Users },
  { id: "products", label: "Product performance", icon: ChartNoAxesCombined },
  { id: "profit", label: "Profit & margins", icon: FileBarChart },
];

const tableTitles: Record<ReportTab, string> = {
  overview: "Sales snapshot data",
  sales: "Sales by period",
  inventory: "Stock and expiry details",
  customers: "Customer purchase details",
  products: "Product performance details",
  profit: "Product margin details",
};

const descriptions: Record<ReportTab, string> = {
  overview: "A quick read of sales, stock value, and items needing attention.",
  sales: "Revenue, order volume, and average transaction by period.",
  inventory: "Available stock compared with reorder levels and earliest expiry.",
  customers: "Customer purchase frequency and spend patterns.",
  products: "Units sold, revenue, and growth versus last month by product.",
  profit: "Gross profit and margin by product.",
};

const peso = (value: number) => `₱${value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
const currencyKeys = new Set(["totalRevenue", "averageTransaction", "topProductSales", "value", "totalSpent", "revenue", "unitPrice", "costPrice", "totalProfit"]);
const percentKeys = new Set(["growth", "profitMargin"]);
const formatHeader = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
// The built-in PDF font has no peso sign, so currency is written as PHP in exported PDFs.
const toPdfText = (value: string | number) => String(value).replace(/₱/g, "PHP ");

function formatValue(key: string, value: string | number) {
  if (typeof value === "number" && currencyKeys.has(key)) return peso(value);
  if (typeof value === "number" && percentKeys.has(key)) return `${value}%`;
  if (key === "status" && typeof value === "string") return value.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase());
  return value;
}

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof FileBarChart }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold text-foreground md:text-3xl">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className="rounded-xl bg-accent-2/10 p-2.5 text-accent-2"><Icon size={19} aria-hidden="true" /></span>
      </div>
    </div>
  );
}

function ReportDataTable({ rows }: { rows: ReportRow[] }) {
  const columns = Object.keys(rows[0] ?? {});
  if (columns.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No rows match your search.</p>;
  }

  return (
    <div className="data-table-frame overflow-x-auto">
      <Table className="min-w-[640px]">
        <caption className="sr-only">Raw report data</caption>
        <thead>
          <tr className="border-b border-border bg-muted">
            {columns.map((key) => (
              <th key={key} scope="col" className={`px-4 py-3 font-semibold text-foreground ${typeof getValue(rows[0], key) === "number" ? "text-right" : "text-left"}`}>
                {formatHeader(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border last:border-0 hover:bg-accent/70">
              {columns.map((key) => (
                <td key={key} className={`px-4 py-3 text-foreground ${typeof getValue(row, key) === "number" ? "text-right tabular-nums" : "text-left"}`}>
                  {formatValue(key, getValue(row, key))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export function Reports() {
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");
  const [search, setSearch] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const { range, setRange, query } = useDateRange();
  const [data, setData] = useState<ReportData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    const token = localStorage.getItem("auth_token") || "";
    const load = async <T,>(path: string): Promise<T> => {
      const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      if (!response.ok) throw new Error(`Could not load ${path}`);
      return response.json() as Promise<T>;
    };

    Promise.all([
      load<ReportSalesResponse>(`/api/reports/sales${query}`),
      load<ReportStockRow[]>("/api/reports/stock"),
      load<ReportCustomerRow[]>(`/api/reports/customers${query}`),
    ])
      .then(([sales, stock, customers]) => setData({ sales, stock, customers, ranged: query !== "" }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "Reports could not be loaded.");
      });

    return () => controller.abort();
  }, [query]);

  if (!data) {
    return (
      <main className="flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-7">
        <div className="w-full">
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            {loadError ?? "Loading reports…"}
          </p>
        </div>
      </main>
    );
  }

  const salesReports = data.sales.periods;
  const performanceMetrics = data.sales.products;
  const inventoryReports = data.stock;
  const customerReports = data.customers;
  const headlinePeriod = data.ranged ? salesReports[0] : salesReports[2];
  const dateRangeNote = activeTab === "inventory"
    ? "Stock levels are a current snapshot, so the date range does not change this tab."
    : activeTab === "profit"
      ? "Profit is not calculated yet, so the date range does not change this tab."
      : null;
  const profitRows: ReportRow[] = [];

  const tableRows: Record<ReportTab, ReportRow[]> = {
    overview: salesReports,
    sales: salesReports,
    inventory: inventoryReports,
    customers: customerReports,
    products: performanceMetrics,
    profit: profitRows,
  };

  const rows = tableRows[activeTab];
  const filteredRows = rows.filter((row) =>
    Object.values(row).some((value) => String(value).toLowerCase().includes(search.trim().toLowerCase())),
  );
  const attentionCount = inventoryReports.filter((item) => item.status !== "in-stock").length;
  const stockValue = inventoryReports.reduce((total, item) => total + item.value, 0);

  const hasRange = Boolean(range.from || range.to);
  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? "Report";
  const exportBaseName = `${activeLabel.replace(/ /g, "_")}${hasRange ? `_${range.from || "start"}_to_${range.to || "today"}` : ""}`;
  const exportDateLines = [
    hasRange ? `Date range: ${range.from || "earliest"} to ${range.to || "today"}` : "No date range selected",
    ...(dateRangeNote ? [dateRangeNote] : []),
  ];

  const handleExport = async (format: "excel" | "pdf") => {
    if (filteredRows.length === 0) return;
    setIsExporting(true);
    try {
      const keys = Object.keys(filteredRows[0]);
      if (format === "excel") {
        const columns: ExcelColumn[] = keys.map((key) => ({ key, header: formatHeader(key), width: 22 }));
        await exportExcelFile(
          `${exportBaseName}.xlsx`,
          activeLabel.slice(0, 31),
          columns,
          filteredRows as unknown as Record<string, unknown>[],
        );
      } else {
        await exportPdfFile(`${exportBaseName}.pdf`, {
          title: `Reports · ${activeLabel}`,
          lines: exportDateLines,
          head: keys.map(formatHeader),
          body: filteredRows.map((row) => keys.map((key) => toPdfText(formatValue(key, getValue(row, key))))),
        });
      }
      toast({ title: "Export complete", description: `The visible report rows were exported to ${format === "excel" ? "Excel" : "PDF"}.` });
    } catch {
      toast({ title: "Export failed", description: "The report could not be exported.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const chartData = activeTab === "overview" || activeTab === "sales"
    ? salesReports
    : activeTab === "inventory"
      ? inventoryReports
      : activeTab === "customers"
        ? customerReports
        : performanceMetrics;

  return (
    <main className="flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-7">
      <div className="w-full space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mt-1 text-3xl font-bold text-foreground">Reports</h1>
            <p className="mt-1 text-sm text-muted-foreground">A clear snapshot of sales, customers, and inventory.</p>
          </div>
          <span className="inline-flex items-center rounded-full border border-success/30 bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
            Live data
          </span>
        </header>

        <section aria-label="Report date range" className="flex flex-wrap items-end justify-between gap-3">
          <DateRangeFilter range={range} onChange={setRange} />
          {dateRangeNote && <p className="text-xs text-muted-foreground">{dateRangeNote}</p>}
        </section>
        {loadError && <p role="alert" className="text-sm text-destructive">{loadError}</p>}

        <section aria-label="Key report metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label={data.ranged ? "Revenue in selected range" : "Month-to-date revenue"} value={peso(headlinePeriod.totalRevenue)} detail={`${headlinePeriod.totalTransactions} transactions`} icon={ChartNoAxesCombined} />
          <MetricCard label="Average transaction" value={peso(headlinePeriod.averageTransaction)} detail={data.ranged ? "Selected range" : "Month to date"} icon={FileBarChart} />
          <MetricCard label="Stock value" value={peso(stockValue)} detail={`${inventoryReports.length} products in stock`} icon={Boxes} />
          <MetricCard label="Needs attention" value={String(attentionCount)} detail="Low-stock or expiry flags" icon={TriangleAlert} />
        </section>

        <section aria-label="Report sections" className="space-y-4">
          <div className="w-full sm:w-80">
            <Select value={activeTab} onValueChange={(value) => setActiveTab(value as ReportTab)}>
              <SelectTrigger aria-label="Report section" className="h-11 w-full rounded-xl border-border bg-card px-4 text-sm font-semibold text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <SelectItem key={tab.id} value={tab.id}>
                      <span className="inline-flex items-center gap-2">
                        <Icon size={16} aria-hidden="true" />{tab.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground">{tabs.find((tab) => tab.id === activeTab)?.label}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{descriptions[activeTab]}</p>
                </div>
                <div role="group" aria-label="Export report" className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">Export</span>
                  <Button type="button" variant="outline" onClick={() => void handleExport("excel")} disabled={isExporting || filteredRows.length === 0}>
                    <FileSpreadsheet size={16} aria-hidden="true" />Excel
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleExport("pdf")} disabled={isExporting || filteredRows.length === 0}>
                    <FileText size={16} aria-hidden="true" />PDF
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(250px,0.8fr)]">
                <div className="min-w-0 rounded-xl bg-muted/70 p-3 md:p-4">
                  {activeTab === "overview" || activeTab === "sales" ? (
                    <>
                      {/* Today, last 7 days and month to date overlap (today is inside all three),
                          so they are listed as figures, not drawn as comparable bars. */}
                      <h3 className="mb-3 text-sm font-semibold text-foreground">Revenue by period</h3>
                      <dl className="grid gap-3 sm:grid-cols-3">
                        {salesReports.map((report) => (
                          <div key={report.period} className="rounded-lg border border-border bg-card p-4">
                            <dt className="text-xs text-muted-foreground">{report.period}</dt>
                            <dd className="mt-1 font-rajdhani text-2xl font-bold tabular-nums text-foreground">{peso(report.totalRevenue)}</dd>
                            <dd className="mt-0.5 text-xs text-muted-foreground">{report.totalTransactions.toLocaleString()} transactions</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  ) : activeTab === "profit" ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      Profit cannot be calculated yet because products do not have recorded cost prices.
                    </p>
                  ) : (
                    <>
                      <h3 className="mb-2 text-sm font-semibold text-foreground">{activeTab === "inventory" ? "Stock vs. reorder level" : activeTab === "customers" ? "Spend by customer" : "Units sold by product"}</h3>
                      <div role="img" aria-label={`${tabs.find((tab) => tab.id === activeTab)?.label} chart; use the data table below for exact values`} className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 22, right: 12, left: 4, bottom: 8 }}>
                            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey={activeTab === "customers" ? "customerName" : "productName"} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-12} textAnchor="end" height={54} />
                            <YAxis width={70} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(value) => activeTab === "customers" ? `₱${Number(value) >= 1000 ? `${(Number(value) / 1000).toFixed(0)}k` : value}` : String(value)} />
                            <Tooltip cursor={{ fill: "hsl(var(--accent))" }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--popover-foreground))", fontSize: 12 }} formatter={(value) => activeTab === "inventory" || activeTab === "products" ? Number(value).toLocaleString() : peso(Number(value))} />
                            {activeTab === "inventory" && <Legend wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }} />}
                            {activeTab === "inventory" && <>
                              <Bar dataKey="currentStock" name="Available stock" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={48}><LabelList dataKey="currentStock" position="top" style={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} /></Bar>
                              <Bar dataKey="reorderLevel" name="Reorder level" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                            </>}
                            {activeTab === "customers" && <Bar dataKey="totalSpent" name="Total spent (₱)" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={48}><LabelList dataKey="totalSpent" position="top" formatter={(value) => `₱${(Number(value) / 1000).toFixed(0)}k`} style={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} /></Bar>}
                            {activeTab === "products" && <Bar dataKey="unitsSold" name="Units sold" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={48}><LabelList dataKey="unitsSold" position="top" style={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} /></Bar>}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </div>

                <aside className="rounded-xl border border-border p-4">
                  <h3 className="text-sm font-semibold text-foreground">Highlights</h3>
                  {activeTab === "overview" || activeTab === "inventory" ? (
                    <div className="mt-3 space-y-3">
                      {inventoryReports.filter((item) => item.status !== "in-stock").map((item) => (
                        <div key={item.sku} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                          <div><p className="text-sm font-medium text-foreground">{item.productName}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.currentStock} units · reorder at {item.reorderLevel}</p></div>
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === "low-stock" ? "bg-warning-soft text-warning" : "bg-warning-soft text-warning"}`}>{item.status === "low-stock" ? "Low stock" : "Expiry flag"}</span>
                        </div>
                      ))}
                      {attentionCount === 0 && <p className="text-sm text-muted-foreground">No items need attention.</p>}
                    </div>
                  ) : activeTab === "sales" ? (
                    <div className="mt-3 space-y-3"><p className="text-xs text-muted-foreground">Top item by period</p>{salesReports.map((report) => <div key={report.period} className="flex justify-between gap-3 border-b border-border pb-2 last:border-0"><span className="text-sm text-muted-foreground">{report.period}</span><span className="text-right text-sm font-semibold text-foreground">{report.topProduct}<br />{peso(report.topProductSales)}</span></div>)}</div>
                  ) : activeTab === "customers" ? (
                    <div className="mt-3 space-y-3">{customerReports.map((customer, index) => <div key={customer.customerId} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0"><span className="text-sm text-foreground">{index + 1}. {customer.customerName}</span><span className="text-sm font-semibold text-foreground">{peso(customer.totalSpent)}</span></div>)}</div>
                  ) : activeTab === "products" ? (
                    <div className="mt-3 space-y-3">{performanceMetrics.map((product) => <div key={product.productName} className="flex justify-between gap-3 border-b border-border pb-2 last:border-0"><span className="text-sm text-foreground">#{product.ranking} {product.productName}</span><span className="text-sm font-semibold text-foreground">{product.growth}% growth</span></div>)}</div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">Cost prices are not recorded yet, so margins are unavailable.</p>
                  )}
                </aside>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-foreground">{tableTitles[activeTab]}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Underlying figures for the chart · {filteredRows.length} of {rows.length} rows</p>
                </div>
                <div className="w-full sm:w-72">
                  <SearchFilterBar
                    searchTerm={search}
                    onSearchChange={setSearch}
                    placeholder="Filter these report rows…"
                  />
                </div>
              </div>
              <div className="mt-4"><ReportDataTable rows={filteredRows} /></div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
