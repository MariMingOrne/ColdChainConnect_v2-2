import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SearchFilterBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  filters?: {
    name: string;
    value: string;
    onChange: (value: string) => void;
    options: { label: string; value: string }[];
  }[];
}

export function SearchFilterBar({
  searchTerm,
  onSearchChange,
  placeholder = "Search…",
  filters = [],
}: SearchFilterBarProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {filters.map((filter) => (
            <Select key={filter.name} value={filter.value} onValueChange={filter.onChange}>
              <SelectTrigger aria-label={filter.name} className="h-10 w-full rounded-full border-border bg-white px-4 text-sm font-semibold text-navy sm:w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filter.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      )}
      <div className="group relative flex w-full items-center gap-2 rounded-full border border-border bg-white px-4 focus-within:border-accent-2 focus-within:ring-2 focus-within:ring-accent-2/20 sm:w-72">
        <Search size={16} className="shrink-0 text-muted" aria-hidden="true" />
        <Input
          type="search"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 py-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        {searchTerm && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear search"
            onClick={() => onSearchChange("")}
            className="h-8 w-8 shrink-0 border-0 bg-transparent p-0 shadow-none hover:bg-off-white"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
