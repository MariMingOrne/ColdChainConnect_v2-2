import type { RequestHandler } from "express";
import { can, STAFF_API_MODULES, STAFF_READ_API_MODULES, type Action } from "../../shared/permissions";
import type { AuthRequest } from "./auth";

export function requirePermission(action: Action): RequestHandler {
  return (req, res, next) => {
    const { user, modulePermissions } = req as AuthRequest;
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!can({ role: user.role, module_permissions: modulePermissions }, action)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

/** Allows the request when the user holds at least one of the given actions. */
export function requireAnyPermission(...actions: Action[]): RequestHandler {
  return (req, res, next) => {
    const { user, modulePermissions } = req as AuthRequest;
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const subject = { role: user.role, module_permissions: modulePermissions };
    if (!actions.some((action) => can(subject, action))) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

/** Mounted on /api after authMiddleware: staff only reach the API prefixes their modules unlock
 * (read-only lookups can also be unlocked by STAFF_READ_API_MODULES). */
export const staffModuleGuard: RequestHandler = (req, res, next) => {
  const authReq = req as AuthRequest;
  if (authReq.user?.role !== "staff") return next();
  const prefix = Object.keys(STAFF_API_MODULES).find((path) => req.path === path || req.path.startsWith(`${path}/`));
  const isRead = req.method === "GET" || req.method === "HEAD";
  const modules = prefix ? [...STAFF_API_MODULES[prefix], ...(isRead ? STAFF_READ_API_MODULES[prefix] ?? [] : [])] : [];
  const granted = modules.some((module) => authReq.modulePermissions?.includes(module));
  if (!granted) return res.status(403).json({ error: "Module access denied" });
  next();
};
