import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, Menu, Search, Truck, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { NotificationPanel } from "./NotificationPanel";
import { useNotifications } from "@/hooks/useNotifications";
import { useGlobalSearchData } from "@/hooks/useGlobalSearchData";
import { EMPTY_SEARCH_DATA, searchAll, type SearchHit } from "@/lib/globalSearch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface TopbarProps {
  userName: string;
  onLogout?: () => void;
  agentMode?: boolean; // hides back-to-dashboard button
}

export function Topbar({ userName, onLogout, agentMode = false }: TopbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") ?? "");
  const [showNotifications, setShowNotifications] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [hoveredSuggestionId, setHoveredSuggestionId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { data: searchData = EMPTY_SEARCH_DATA, isFetching: isFetchingSearch } = useGlobalSearchData(
    isSearchFocused && Boolean(searchTerm.trim())
  );
  const suggestions = useMemo(
    () => searchAll(searchData, searchTerm)
      .flatMap((group) => group.hits.map((hit) => ({ ...hit, group: group.label })))
      .slice(0, 8),
    [searchData, searchTerm]
  );
  const role = useAuth((state) => state.user?.role);
  const {
    notifications,
    unreadCount,
    truckAssignments,
    isLoading: isLoadingNotifications,
    error: notificationError,
    refresh: refreshNotifications,
    markAsRead,
    markAllAsRead,
    dismiss,
  } = useNotifications();

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && role !== "agent") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [role]);

  useEffect(() => {
    setSearchTerm(searchParams.get("q") ?? "");
  }, [searchParams]);

  const handleSearchTermChange = (value: string) => {
    setSearchTerm(value);
    setHoveredSuggestionId(null);
    if (location.pathname === "/search") {
      const nextParams = new URLSearchParams(searchParams);
      if (value.trim()) nextParams.set("q", value);
      else nextParams.delete("q");
      nextParams.delete("highlight");
      setSearchParams(nextParams, { replace: true });
    }
  };

  const updateHoveredSuggestion = (hitId: string | null) => {
    setHoveredSuggestionId(hitId);
    if (location.pathname !== "/search") return;
    const nextParams = new URLSearchParams(searchParams);
    if (hitId) nextParams.set("highlight", hitId);
    else nextParams.delete("highlight");
    setSearchParams(nextParams, { replace: true });
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const query = searchTerm.trim();
    if (!query) return;
    setIsSearchFocused(false);
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const handleSuggestionSelect = (hit: SearchHit) => {
    setIsSearchFocused(false);
    navigate(hit.path);
  };

  return (
    <header className="bg-navy px-4 md:px-8 py-3 sm:py-4 flex flex-wrap items-center flex-shrink-0 sticky top-0 z-10 shadow-sm gap-2 sm:gap-4 md:gap-6 animate-slide-down">
      <div className={`flex items-center gap-4 min-w-0 ${role === "agent" ? "flex-1" : "flex-1 sm:flex-none"}`}>
        {/* Left Section - Logo & Back Button */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {!agentMode && (
            <button
              onClick={() => navigate("/")}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Back to Dashboard"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
          )}

          {!agentMode && <div className="h-6 w-px bg-white/20 hidden sm:block" />}

          <div className="flex items-center gap-2">
            <img src="https://cdn.builder.io/api/v1/image/assets%2F95235f61d85340cc8929dd5e2ec9cafe%2F04690f469f254fd393684ed5411b7cab?format=webp&width=800&height=1200" alt="ACDP Logo" className="w-8 h-8 object-cover rounded-full" />
            <div className="font-rajdhani text-xl font-bold letter-spacing-wider text-white hidden sm:block">
              ACDP
            </div>
          </div>

          {role === "agent" && (
            <div className="flex min-w-0 flex-1 items-center gap-2 border-l border-white/20 pl-3 sm:pl-4" aria-label="Assigned truck and district">
              <Truck size={16} className="shrink-0 text-white/80" />
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-white/60">Assigned truck · district</span>
                <span className="truncate text-xs font-semibold text-white" title={truckAssignments.join(" / ")}>
                  {truckAssignments.length ? truckAssignments.join(" / ") : "No active truck assignment"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

        {role !== "agent" && (
          <form
            onSubmit={handleSearch}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsSearchFocused(false);
                updateHoveredSuggestion(null);
              }
            }}
            className="relative order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-md"
          >
            <input
              ref={searchInputRef}
              type="text"
              aria-keyshortcuts="Control+K Meta+K"
              placeholder="Search products, customers, orders…"
              value={searchTerm}
              onFocus={() => setIsSearchFocused(true)}
              onChange={(event) => handleSearchTermChange(event.target.value)}
              className="w-full pl-4 pr-11 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
            />
            <button
              type="submit"
              aria-label="Search"
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
            {isSearchFocused && searchTerm.trim() && (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(70vh,420px)] overflow-y-auto rounded-lg border border-border bg-white p-1.5 text-navy shadow-xl">
                {isFetchingSearch && searchData === EMPTY_SEARCH_DATA ? (
                  <p className="px-3 py-3 text-sm text-navy/60">Searching…</p>
                ) : suggestions.length ? (
                  <>
                    {suggestions.map((hit) => (
                      <button
                        key={`${hit.group}-${hit.id}`}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => updateHoveredSuggestion(hit.id)}
                        onMouseLeave={() => updateHoveredSuggestion(null)}
                        onFocus={() => updateHoveredSuggestion(hit.id)}
                        onClick={() => handleSuggestionSelect(hit)}
                        className={`w-full rounded-md border-l-2 px-3 py-2 text-left transition-colors ${hoveredSuggestionId === hit.id ? "border-accent-2 bg-accent-2/10" : "border-transparent hover:bg-off-white focus-visible:bg-off-white"}`}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-semibold">{hit.title}</span>
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-navy/50">{hit.group}</span>
                        </span>
                        {hit.subtitle && <span className="block truncate text-xs text-navy/60">{hit.subtitle}</span>}
                      </button>
                    ))}
                    <button
                      type="submit"
                      onMouseDown={(event) => event.preventDefault()}
                      className="mt-1 w-full rounded-md border-t border-border px-3 py-2 text-left text-xs font-semibold text-accent-2 hover:bg-off-white"
                    >
                      See all results for “{searchTerm.trim()}”
                    </button>
                  </>
                ) : (
                  <p className="px-3 py-3 text-sm text-navy/60">No matching results.</p>
                )}
              </div>
            )}
          </form>
        )}

      {/* Right Section */}
      <div className="ml-auto flex items-center gap-2 relative">
        {role === "admin" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="Main navigation" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/20 md:hidden">
                <Menu size={19} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-navy text-white border-white/20">
              <DropdownMenuItem onClick={() => navigate("/")} className="focus:bg-white/10 focus:text-white cursor-pointer">Dashboard</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/information-management/inventory")} className="focus:bg-white/10 focus:text-white cursor-pointer">Inventory & Storage</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/booking-dispatch/order-summary")} className="focus:bg-white/10 focus:text-white cursor-pointer">Bookings & Orders</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/booking-dispatch/delivery")} className="focus:bg-white/10 focus:text-white cursor-pointer">Logistics & Fleet</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/reports")} className="focus:bg-white/10 focus:text-white cursor-pointer">Reports</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {/* Notification button */}
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 cursor-pointer text-white transition-all hover:bg-white/20"
        >
          <span className="text-lg">🔔</span>
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-red rounded-full text-[10px] flex items-center justify-center text-white font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </div>
          )}
        </button>

        {role === "admin" && (
          <button
            onClick={() => navigate("/manage-accounts")}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition-all hover:bg-white/20"
          >
            <Users size={17} aria-hidden="true" />
            <span className="hidden sm:inline">Manage Accounts</span>
          </button>
        )}

        {/* Settings dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 cursor-pointer text-white transition-all hover:bg-white/20">
              <span className="text-lg">⚙️</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-navy text-white border-white/20">
            <DropdownMenuItem onClick={onLogout} className="focus:bg-white/10 focus:text-white cursor-pointer">Log Out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notification Panel */}
        {showNotifications && (
          <NotificationPanel
            notifications={notifications}
            isLoading={isLoadingNotifications}
            error={notificationError}
            onRefresh={() => void refreshNotifications()}
            onMarkAsRead={markAsRead}
            onMarkAllAsRead={markAllAsRead}
            onDismiss={dismiss}
            onClose={() => setShowNotifications(false)}
          />
        )}
      </div>
    </header>
  );
}
