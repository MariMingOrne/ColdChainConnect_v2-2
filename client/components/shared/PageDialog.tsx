import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * Shows a former full-page screen (details, edit form, import wizard) as a modal over the list it
 * came from, so the table stays mounted behind it and nothing navigates.
 */
const isInsideOpenPopup = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[data-popup-open="true"]') !== null;

export function PageDialog({ onClose, children, label = "Details" }: { onClose: () => void; children: ReactNode; label?: string }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[92dvh] w-[min(96vw,64rem)] max-w-none gap-0 overflow-y-auto p-0 [&_.page-header]:pr-10 [&>div]:max-w-none"
        onInteractOutside={(event) => {
          if (isInsideOpenPopup(event.target)) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (document.querySelector('[data-popup-open="true"]')) event.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">{label}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
