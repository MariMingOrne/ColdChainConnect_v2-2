import { useState } from "react";
import { AuditLog } from "@shared/api";
import { ActivityReport } from "./ActivityReport";
import {
  CustomerReport, InventoryReport, PerformanceReport, ProfitReport, SalesReport,
} from "./BusinessReports";

type ReportTab = "activity" | "sales" | "inventory" | "customer" | "performance" | "profit";

const REPORT_TABS: { id: ReportTab; label: string; }[] = [
  { id: "activity", label: "Activity" },
  { id: "sales", label: "Sales" },
  { id: "inventory", label: "Inventory" },
  { id: "customer", label: "Customer" },
  { id: "performance", label: "Performance" },
  { id: "profit", label: "Profit" },
];

export function AuditReports({ logs }: { logs: AuditLog[] }) {
  const [activeTab, setActiveTab] = useState<ReportTab>("activity");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              activeTab === tab.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "activity" && <ActivityReport logs={logs} />}
      {activeTab === "sales" && <SalesReport />}
      {activeTab === "inventory" && <InventoryReport />}
      {activeTab === "customer" && <CustomerReport />}
      {activeTab === "performance" && <PerformanceReport />}
      {activeTab === "profit" && <ProfitReport />}
    </div>
  );
}
