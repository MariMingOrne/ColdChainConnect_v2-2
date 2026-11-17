import { useQuery } from "@tanstack/react-query";
import type { Booking, Customer, Invoice, InventoryBatch, Product, Truck } from "@shared/api";
import { EMPTY_SEARCH_DATA, type SearchData } from "@/lib/globalSearch";
import { useAuth } from "@/hooks/useAuth";

async function fetchSearchData(token: string, isAgent: boolean): Promise<SearchData> {
  const fetchList = async <T,>(path: string): Promise<T[]> => {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
    return response.ok ? response.json() : [];
  };
  const adminOnly = <T,>(path: string) => isAgent ? Promise.resolve([] as T[]) : fetchList<T>(path);

  const [bookings, customers, products, inventoryBatches, invoices, trucks] = await Promise.all([
    fetchList<Booking>("/api/bookings"),
    adminOnly<Customer>("/api/customers"),
    adminOnly<Product>("/api/products"),
    adminOnly<InventoryBatch>("/api/inventory-batches"),
    adminOnly<Invoice>("/api/invoices"),
    adminOnly<Truck>("/api/trucks"),
  ]);

  return { bookings, customers, products, inventoryBatches, invoices, trucks };
}

export function useGlobalSearchData(enabled = true) {
  const token = useAuth((state) => state.token);
  const isAgent = useAuth((state) => state.user?.role === "agent");

  return useQuery({
    queryKey: ["global-search-data", token, isAgent],
    queryFn: () => fetchSearchData(token as string, isAgent),
    enabled: Boolean(token) && enabled,
    staleTime: 30_000,
  });
}
