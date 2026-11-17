import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useGlobalSearchData } from "../hooks/useGlobalSearchData";
import { EMPTY_SEARCH_DATA, searchAll } from "../lib/globalSearch";
import { SearchResultGroup } from "../components/SearchResultGroup";

export function SearchResults() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const highlightedId = searchParams.get("highlight");
  const { data = EMPTY_SEARCH_DATA, isLoading } = useGlobalSearchData();
  const groups = useMemo(() => searchAll(data, query), [data, query]);

  useEffect(() => {
    if (!highlightedId || isLoading) return;
    document.getElementById(`search-hit-${encodeURIComponent(highlightedId)}`)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [highlightedId, isLoading]);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8 max-w-3xl w-full mx-auto">
      <h1 className="text-2xl font-bold text-navy">
        {query.trim() ? `Results for “${query.trim()}”` : "Search"}
      </h1>

      {!query.trim() && (
        <p className="text-navy/60">Type a term in the search bar above to search all modules.</p>
      )}

      {query.trim() && isLoading && <LoadingSpinner className="min-h-24" />}

      {query.trim() && !isLoading && groups.length === 0 && (
        <p className="text-navy/60">No results found.</p>
      )}

      {!isLoading && groups.map((group) => (
        <SearchResultGroup key={group.label} group={group} highlightedId={highlightedId} />
      ))}
    </div>
  );
}
