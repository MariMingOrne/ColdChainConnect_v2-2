import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a route's code chunk loads: the shape of a page header and a table. */
export function PageSkeleton() {
  return (
    <div className="space-y-5 px-4 py-6 md:px-6" role="status" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Screen crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const isChunkError = /Failed to fetch dynamically imported module|Loading chunk/i.test(this.state.error.message);
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive-soft text-destructive">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">This screen could not be shown</h1>
          <p className="text-sm text-muted-foreground">
            {isChunkError
              ? "A newer version of the app is available. Reload to continue."
              : "Something went wrong while displaying it. Your data is safe; reload to try again."}
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>
          <RotateCcw aria-hidden="true" /> Reload
        </Button>
      </div>
    );
  }
}

/** Error boundary + lazy-loading fallback for a route; resets when the path changes. */
export function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  );
}
