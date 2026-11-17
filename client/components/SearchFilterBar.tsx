import { Search, X } from "lucide-react";

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
    <div className="flex min-w-0 flex-1 flex-col items-stretch gap-3 sm:flex-row">
      <div className="relative flex min-w-0 flex-1 items-center rounded-full border border-border bg-white px-4">
        <Search size={16} className="shrink-0 text-muted" aria-hidden="true" />
        <input
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent py-2 pl-2 text-sm text-navy outline-none placeholder:text-muted"
        />
        {searchTerm && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearchChange("")}
            className="text-muted transition-colors hover:text-navy"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {filters.map((filter) => (
        <select
          key={filter.name}
          value={filter.value}
          onChange={(e) => filter.onChange(e.target.value)}
          className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-navy transition-colors focus:border-accent-2 focus:outline-none"
        >
          {filter.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
