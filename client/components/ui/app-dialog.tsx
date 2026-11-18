import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type DialogRequest = {
  message: string;
  isConfirm: boolean;
  resolve: (accepted: boolean) => void;
};

let enqueue: ((request: DialogRequest) => void) | null = null;

function request(message: string, isConfirm: boolean) {
  return new Promise<boolean>((resolve) => {
    if (!enqueue) return resolve(false);
    enqueue({ message, isConfirm, resolve });
  });
}

export function notify(message: string) {
  return request(message, false).then(() => undefined);
}

export function confirmAction(message: string) {
  return request(message, true);
}

export function AppDialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const active = queue[0];

  useEffect(() => {
    enqueue = (next) => setQueue((current) => [...current, next]);
    return () => {
      enqueue = null;
    };
  }, []);

  const close = (accepted: boolean) => {
    if (!active) return;
    active.resolve(accepted);
    setQueue((current) => current.slice(1));
  };

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
        className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-xl"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">ACDP</p>
        <h2 id="app-dialog-title" className="mt-1 text-lg font-bold text-navy">
          {active.isConfirm ? "Please confirm" : "Notice"}
        </h2>
        <p id="app-dialog-message" className="mt-3 text-sm leading-relaxed text-navy">
          {active.message}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          {active.isConfirm && (
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
          )}
          <Button type="button" autoFocus onClick={() => close(true)}>
            {active.isConfirm ? "Confirm" : "OK"}
          </Button>
        </div>
      </div>
    </div>
  );
}
