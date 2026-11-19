import { Button } from "@/components/ui/button";
import { ChevronDown, FileSpreadsheet, Download, Upload } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ExcelActionsDropdownProps {
  onImport?: () => void;
  onExport?: () => void | Promise<void>;
  exportDisabled?: boolean;
  className?: string;
}

export function ExcelActionsDropdown({
  onImport,
  onExport,
  exportDisabled = false,
  className,
}: ExcelActionsDropdownProps) {
  if (!onImport && !onExport) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" aria-label="Excel actions" className={cn("gap-2", className)}>
          <FileSpreadsheet size={16} aria-hidden="true" />
          Excel
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onImport && (
          <DropdownMenuItem onSelect={onImport}>
            <Upload size={15} className="mr-2" aria-hidden="true" />
            Import Excel
          </DropdownMenuItem>
        )}
        {onExport && (
          <DropdownMenuItem
            disabled={exportDisabled}
            onSelect={() => { void onExport(); }}
          >
            <Download size={15} className="mr-2" aria-hidden="true" />
            Export Excel
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
