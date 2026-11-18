import { create } from "zustand";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for deletes and other irreversible actions. */
  destructive?: boolean;
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  open: (options: ConfirmOptions) => Promise<boolean>;
  settle: (ok: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  open: (options) =>
    new Promise<boolean>((resolve) => {
      get().request?.resolve(false); // a newer request replaces an unanswered one
      set({ request: { ...options, resolve } });
    }),
  settle: (ok) => {
    get().request?.resolve(ok);
    set({ request: null });
  },
}));

const DESTRUCTIVE_WORDS = /\b(delete|remove|roll back|reset|revert|unapprove|permanently)\b/i;

/**
 * App-styled replacement for window.confirm. Resolves true when confirmed.
 * A plain string becomes the title; delete-like wording gets a red button.
 */
export function confirmAction(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === "string" ? { title: options } : options;
  return useConfirmStore.getState().open({
    destructive: DESTRUCTIVE_WORDS.test(`${opts.title} ${opts.description ?? ""}`),
    ...opts,
  });
}

/** Mount once near the app root. */
export function ConfirmDialogHost() {
  const request = useConfirmStore((state) => state.request);
  const settle = useConfirmStore((state) => state.settle);

  return (
    <AlertDialog open={request !== null} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          {request?.description && <AlertDialogDescription>{request.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>{request?.cancelLabel ?? "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={request?.destructive ? buttonVariants({ variant: "destructive" }) : undefined}
          >
            {request?.confirmLabel ?? (request?.destructive ? "Yes, continue" : "Confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
