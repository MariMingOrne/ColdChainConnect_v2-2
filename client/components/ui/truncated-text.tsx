import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Single-line text that ends in an ellipsis when it does not fit, with the full text in a tooltip.
 * The tooltip only opens when the text is actually clipped, so short values behave like plain text.
 */
export function TruncatedText({
  children,
  className,
  tooltip,
}: {
  children: React.ReactNode;
  className?: string;
  /** Override the tooltip content when `children` is not a plain string. */
  tooltip?: React.ReactNode;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = React.useState(false);
  const check = () => {
    const el = ref.current;
    if (el) setClipped(el.scrollWidth > el.clientWidth + 1);
  };

  return (
    <Tooltip open={clipped ? undefined : false} onOpenChange={(open) => open && check()}>
      <TooltipTrigger asChild>
        <span
          ref={ref}
          onMouseEnter={check}
          onFocus={check}
          tabIndex={clipped ? 0 : undefined}
          className={cn("block max-w-full truncate", className)}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-normal break-words">{tooltip ?? children}</TooltipContent>
    </Tooltip>
  );
}
