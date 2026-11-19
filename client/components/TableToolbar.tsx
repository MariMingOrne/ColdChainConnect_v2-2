import type { ReactNode } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
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
            <Button type="button" disabled={selectedCount === 0 || bulkActions.length === 0}>
              <MoreHorizontal size={16} /> Actions ({selectedCount})
            </Button>
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
        <Input
          type="search"
          aria-label={searchPlaceholder}
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full pl-9"
        />
      </div>
      {children}
    </div>
  );
}

export function TableFilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <NativeSelect aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {children}
    </NativeSelect>
  );
}
