import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Classes that size or place the control; these belong on the wrapper, not the <select>. */
const LAYOUT_CLASS = /^(?:[a-z0-9-]+:)*(?:w-|min-w-|max-w-|flex-|grow|shrink|basis-|self-|col-|row-|order-|m[trblxy]?-|-m[trblxy]?-)/;

/**
 * A styled native <select>, matching <Input>. Used instead of the Radix Select
 * where options include an empty value ("All", "None") — Radix Select does not
 * allow "" — and on phone screens, where the native picker is easier to use.
 *
 * Width and placement classes (w-full, flex-1, ml-2…) go to the wrapper so the
 * control lays out like the bare <select> it replaces; without one it sizes to
 * its longest option.
 */
const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => {
    const classes = (className ?? "").split(/\s+/).filter(Boolean);
    const layout = classes.filter((c) => LAYOUT_CLASS.test(c));
    const rest = classes.filter((c) => !LAYOUT_CLASS.test(c));
    return (
      <div className={cn("relative", layout)}>
        <select
          ref={ref}
          className={cn(
            "flex h-10 w-full appearance-none rounded-lg border border-border bg-card py-2 pl-3 pr-9 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            rest,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      </div>
    );
  },
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
