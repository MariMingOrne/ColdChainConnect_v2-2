import type { ReactNode } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface TableBulkAction {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

interface TableToolbarProps {
  selectedCount?: number;
  bulkActions?: TableBulkAction[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  children?: ReactNode;
}

export function TableToolbar({ selectedCount = 0, bulkActions, searchValue, onSearchChange, searchPlaceholder, children }: TableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {bulkActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={selectedCount === 0}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MoreHorizontal size={16} /> Actions ({selectedCount})
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-card text-foreground">
            {bulkActions.map((action) => (
              <DropdownMenuItem
                key={action.label}
                className={action.destructive ? "text-red focus:text-red" : undefined}
                onClick={action.onSelect}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <div className="relative w-full sm:w-72">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-4 text-sm focus:border-accent-2 focus:outline-none"
        />
      </div>
      {children}
    </div>
  );
}

export function TableFilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground focus:border-accent-2 focus:outline-none"
    >
      {children}
    </select>
  );
}
