import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const AUTH_ENDPOINTS = /\/api\/auth\/(login|mfa|logout)/;
let installed = false;
let signingOut = false;

/**
 * Signs the user out when any API call says their session is no longer valid
 * (expired token, deleted account, changed role). Without this each screen
 * just showed its own error and the user stayed on a broken page.
 */
export function installSessionGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (
      response.status === 401 &&
      url.includes("/api/") &&
      !AUTH_ENDPOINTS.test(url) &&
      useAuth.getState().token &&
      !signingOut
    ) {
      signingOut = true;
      const message = await response.clone().json().then((body) => body?.error).catch(() => null);
      toast.error(message || "Your session has ended. Please sign in again.");
      void useAuth.getState().logout().finally(() => {
        signingOut = false;
      });
    }
    return response;
  };
}
