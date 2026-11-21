import { MIN_PASSWORD_LENGTH } from "../../shared/api";
import type { RequestHandler } from "express";
import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { hashPassword } from "../auth";
import { modulePermissionKeys } from "../../shared/api";
import type { CreateAccountRequest, CreateAccountResponse, ModulePermission } from "../../shared/api";
import type { AuthRequest } from "../middleware/auth";

const ROLES: CreateAccountRequest["role"][] = ["admin", "agent", "staff"];

export const handleListManagedAccounts: RequestHandler = async (req: AuthRequest, res) => {
  if (req.user?.role === "staff") {
    const accounts = await db.select({ id: users.id, username: users.username, role: users.role, created_at: users.created_at, mfa_enabled: users.mfa_enabled, mfa_required: users.mfa_required, module_permissions: users.module_permissions, is_archived: users.is_archived }).from(users).where(eq(users.id, req.user.userId));
    return res.json(accounts);
  }
  const accounts = await db
    .select({ id: users.id, username: users.username, role: users.role, created_at: users.created_at, mfa_enabled: users.mfa_enabled, mfa_required: users.mfa_required, module_permissions: users.module_permissions, is_archived: users.is_archived })
    .from(users)
    .where(inArray(users.role, ["admin", "staff"]))
    .orderBy(desc(users.created_at));
  res.json(accounts);
};

export const handleUpdateMfaRequirement: RequestHandler = async (req, res) => {
  const { userId } = req.params;
  const required = (req.body as { mfa_required?: unknown }).mfa_required;
  if (typeof required !== "boolean") return res.status(400).json({ error: "mfa_required must be a boolean" });

  const [updated] = await db.update(users).set({ mfa_required: required }).where(eq(users.id, userId)).returning({ id: users.id, mfa_required: users.mfa_required });
  if (!updated) return res.status(404).json({ error: "Account not found" });
  res.json(updated);
};

export const handleUpdateArchiveStatus: RequestHandler = async (req: AuthRequest, res) => {
  const { userId } = req.params;
  const archived = (req.body as { is_archived?: unknown }).is_archived;
  if (typeof archived !== "boolean") return res.status(400).json({ error: "is_archived must be a boolean" });
  if (archived && userId === req.user?.userId) return res.status(400).json({ error: "You cannot archive your own account" });

  const [updated] = await db
    .update(users)
    .set({ is_archived: archived, updated_at: new Date() })
    .where(and(eq(users.id, userId), inArray(users.role, ["admin", "staff"])))
    .returning({ id: users.id, is_archived: users.is_archived });
  if (!updated) return res.status(404).json({ error: "Account not found" });
  res.json(updated);
};

export const handleUpdateStaffPermissions: RequestHandler = async (req, res) => {
  const { userId } = req.params;
  const permissions = (req.body as { module_permissions?: unknown }).module_permissions;
  if (!Array.isArray(permissions) || !permissions.every((key) => typeof key === "string" && modulePermissionKeys.includes(key as (typeof modulePermissionKeys)[number]))) {
    return res.status(400).json({ error: "Invalid module permissions" });
  }

  const [staff] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (staff?.role !== "staff") return res.status(404).json({ error: "Staff account not found" });
  const [updated] = await db.update(users).set({ module_permissions: [...new Set(permissions)] }).where(eq(users.id, userId)).returning({ id: users.id, module_permissions: users.module_permissions });
  res.json(updated);
};

export const handleCreateAccount: RequestHandler = async (req, res) => {
  const body = req.body as Partial<CreateAccountRequest>;
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role;
  const requestedPermissions = (req.body as { module_permissions?: unknown }).module_permissions;
  if (role === "staff" && requestedPermissions !== undefined && (!Array.isArray(requestedPermissions) || !requestedPermissions.every((key) => typeof key === "string" && modulePermissionKeys.includes(key as (typeof modulePermissionKeys)[number])))) {
    return res.status(400).json({ error: "Invalid module permissions" });
  }
  const staffPermissions = role === "staff" ? (requestedPermissions as ModulePermission[] | undefined) ?? [] : modulePermissionKeys.slice();

  if (!username || !password || !role) {
    return res.status(400).json({ error: "Username, password, and role required" });
  }

  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: "Role must be admin, agent, or staff" });
  }

  if (password.trim().length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, username),
    });

    if (existingUser) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const id = randomUUID();
    await db.insert(users).values({
      id,
      username,
      password_hash: await hashPassword(password),
      role,
      module_permissions: staffPermissions,
    });

    const created: CreateAccountResponse = { id, username, role };
    res.status(201).json(created);
  } catch (error) {
    console.error("Account creation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
