import { useEffect, useRef } from "react";

interface AutoRefreshOptions {
  intervalMs?: number;
  enabled?: boolean;
}

export function useAutoRefresh(
  callback: () => void | Promise<void>,
  { intervalMs = 60_000, enabled = true }: AutoRefreshOptions = {},
) {
  const callbackRef = useRef(callback);
  const isRunningRef = useRef(false);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setInterval(() => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      void (async () => {
        try {
          await callbackRef.current();
        } catch (error) {
          console.error("Auto-refresh failed:", error);
        } finally {
          isRunningRef.current = false;
        }
      })();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [enabled, intervalMs]);
}
