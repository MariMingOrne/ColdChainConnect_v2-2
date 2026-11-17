import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const typeClass =
      type === "checkbox" || type === "radio"
        ? "h-4 w-4 shrink-0 rounded border border-border accent-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2 disabled:cursor-not-allowed disabled:opacity-50"
        : type === "file"
          ? "block w-full cursor-pointer text-sm text-navy file:mr-3 file:rounded-lg file:border-0 file:bg-off-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-navy hover:file:bg-accent-2/10"
          : "flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-navy placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

    return (
      <input
        type={type}
        className={cn(typeClass, className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
