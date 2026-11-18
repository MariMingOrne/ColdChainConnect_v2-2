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
        <button
          type="button"
          aria-label="Excel actions"
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent",
            className,
          )}
        >
          <FileSpreadsheet size={16} aria-hidden="true" />
          Excel
          <ChevronDown size={14} aria-hidden="true" />
        </button>
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
