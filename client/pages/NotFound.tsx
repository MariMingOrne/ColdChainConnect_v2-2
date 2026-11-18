import { Link, useLocation } from "react-router-dom";
import { MapPinOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Unknown address. `embedded` renders inside the app layout (a mistyped
 * sub-page such as /booking-dispatch/oops) instead of taking the whole screen.
 */
const NotFound = ({ embedded = false }: { embedded?: boolean }) => {
  const { pathname } = useLocation();

  return (
    <main className={cn("flex items-center justify-center px-6", embedded ? "py-20" : "min-h-screen bg-background")}>
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MapPinOff className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            Nothing lives at <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">{pathname}</code>. It may have moved, or the link is mistyped.
          </p>
        </div>
        <Link to="/" className={buttonVariants()}>Go to the start page</Link>
      </div>
    </main>
  );
};

export default NotFound;
