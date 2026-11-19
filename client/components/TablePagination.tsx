export const TABLE_PAGE_SIZE = 15;

export function paginate<T>(items: T[], page: number, pageSize = TABLE_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  return {
    currentPage,
    totalPages,
    pageItems: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
  };
}

interface TablePaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}

export function TablePagination({ page, totalPages, totalItems, pageSize = TABLE_PAGE_SIZE, onPageChange }: TablePaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/50">
      <span className="text-xs text-muted-foreground">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-1 border border-border rounded text-xs font-semibold disabled:opacity-40 hover:bg-card"
        >
          Previous
        </button>
        <span className="px-3 py-1 text-xs font-semibold text-foreground">{page} / {totalPages}</span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-3 py-1 border border-border rounded text-xs font-semibold disabled:opacity-40 hover:bg-card"
        >
          Next
        </button>
      </div>
    </div>
  );
}
