import { ReactNode, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Table as TableIcon } from "lucide-react";
import { Table } from "@/components/ui/table";

export interface ReportColumn<T> {
  header: string;
  value: (row: T) => string | number;
  cell?: (row: T) => ReactNode;
  align?: "left" | "right";
}

interface ReportViewProps<T> {
  title: string;
  subtitle?: string;
  chart: ReactNode;
  rows: T[];
  columns: ReportColumn<T>[];
}

function downloadCsv<T>(title: string, columns: ReportColumn<T>[], rows: T[]) {
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const header = columns.map((column) => escape(column.header)).join(",");
  const body = rows.map((row) => columns.map((column) => escape(column.value(row))).join(","));
  const content = `${title}\nGenerated: ${new Date().toLocaleDateString()}\n\n${[header, ...body].join("\n")}\n`;

  const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/\s+/g, "_")}_${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ReportView<T>({ title, subtitle, chart, rows, columns }: ReportViewProps<T>) {
  const [showTable, setShowTable] = useState(false);
  const { toast } = useToast();

  const handleExport = () => {
    downloadCsv(title, columns, rows);
    toast({ title: "Exported", description: `${title} downloaded as CSV.` });
  };

  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowTable((value) => !value)}
            variant="outline" size="sm"
          >
            <TableIcon className="h-4 w-4" />
            {showTable ? "Hide table" : "Show table"}
          </Button>
          <Button onClick={handleExport} className="bg-primary text-sm text-primary-foreground hover:bg-accent-dark">
            Export CSV
          </Button>
        </div>
      </div>

      {chart}

      {showTable && (
        <div className="data-table-frame overflow-x-auto">
          <Table>
            <thead>
              <tr className="border-b border-border bg-muted">
                {columns.map((column) => (
                  <th key={column.header} className={`px-3 py-2 font-semibold text-foreground ${column.align === "right" ? "text-right" : "text-left"}`}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border last:border-b-0 hover:bg-accent">
                  {columns.map((column) => (
                    <td key={column.header} className={`px-3 py-2 text-foreground ${column.align === "right" ? "text-right" : "text-left"}`}>
                      {column.cell ? column.cell(row) : column.value(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}
