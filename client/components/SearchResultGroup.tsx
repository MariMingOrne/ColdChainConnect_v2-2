import { Link } from "react-router-dom";
import type { SearchGroup } from "@/lib/globalSearch";

interface SearchResultGroupProps {
  group: SearchGroup;
  highlightedId?: string | null;
}

export function SearchResultGroup({ group, highlightedId }: SearchResultGroupProps) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold text-foreground/70">
        {group.label} ({group.hits.length})
      </h2>
      <ul className="flex flex-col gap-2">
        {group.hits.map((hit) => (
          <li key={`${group.label}-${hit.id}`}>
            <Link
              id={`search-hit-${encodeURIComponent(hit.id)}`}
              to={hit.path}
              className={`block rounded-lg border px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2 ${highlightedId === hit.id ? "border-accent-2 bg-info-soft ring-2 ring-accent-2/50" : "border-border bg-card hover:border-accent-2/60 hover:bg-primary/5"}`}
            >
              <div className="font-semibold text-foreground">{hit.title}</div>
              {hit.subtitle && <div className="text-sm text-foreground/60">{hit.subtitle}</div>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
