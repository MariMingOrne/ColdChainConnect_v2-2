import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReportTab)} className="space-y-4">
      <TabsList aria-label="Audit reports" className="h-auto flex-wrap justify-start">
        {REPORT_TABS.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="activity"><ActivityReport logs={logs} /></TabsContent>
      <TabsContent value="sales"><SalesReport /></TabsContent>
      <TabsContent value="inventory"><InventoryReport /></TabsContent>
      <TabsContent value="customer"><CustomerReport /></TabsContent>
      <TabsContent value="performance"><PerformanceReport /></TabsContent>
      <TabsContent value="profit"><ProfitReport /></TabsContent>
    </Tabs>
  );
}
