import { can, type Action } from "@shared/permissions";
import { useAuth } from "./useAuth";

/** True when the signed-in user may perform `action`. Mirrors the server rules in shared/permissions.ts. */
export function useCan(action: Action): boolean {
  const user = useAuth((state) => state.user);
  return user ? can(user, action) : false;
}
