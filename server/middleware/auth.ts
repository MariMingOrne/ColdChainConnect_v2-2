import { Request, Response, NextFunction } from "express";
import { verifyToken, TokenPayload } from "../auth";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import type { ModulePermission } from "@shared/api";

export interface AuthRequest extends Request {
  user?: TokenPayload;
  modulePermissions?: string[];
}

const DRIVER_ALLOWED_PATHS = new Set([
  "/api/driver-schedule",
  "/api/auth/refresh",
]);

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid token" });
  }

  if (payload.role === "driver" && !DRIVER_ALLOWED_PATHS.has(req.path)) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  // A token lives 24h. Re-check the account on every request so deleting an
  // account or changing its role takes effect immediately (one PK lookup).
  if (process.env.DATABASE_URL) {
    try {
      const [account] = await db
        .select({ role: users.role, module_permissions: users.module_permissions })
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);
      if (!account) return res.status(401).json({ error: "This account no longer exists. Please sign in again." });
      if (account.role !== payload.role) {
        return res.status(401).json({ error: "Your access has changed. Please sign in again." });
      }
      if (payload.role === "staff") req.modulePermissions = account.module_permissions;
    } catch (error) {
      console.error("Account check failed:", error);
      return res.status(503).json({ error: "Sign-in could not be verified. Try again shortly." });
    }
  }

  req.user = payload;
  next();
}

export function requireModuleAccess(module: ModulePermission) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role === "staff" && !req.modulePermissions?.includes(module)) {
      return res.status(403).json({ error: "Module access denied" });
    }
    next();
  };
}

export function requireRole(...roles: Array<"admin" | "agent" | "driver" | "staff">) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
}
