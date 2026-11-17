import { RequestHandler } from "express";
import { randomUUID } from "crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { hashPassword } from "../auth";
import { modulePermissionKeys } from "../../shared/api";
import type { CreateAccountRequest, CreateAccountResponse } from "../../shared/api";
import type { AuthRequest } from "../middleware/auth";

const ROLES: CreateAccountRequest["role"][] = ["admin", "agent", "staff"];

export const handleListManagedAccounts: RequestHandler = async (req: AuthRequest, res) => {
  if (req.user?.role === "staff") {
    const accounts = await db.select({ id: users.id, username: users.username, role: users.role, created_at: users.created_at, mfa_enabled: users.mfa_enabled, module_permissions: users.module_permissions }).from(users).where(eq(users.id, req.user.userId));
    return res.json(accounts);
  }
  const accounts = await db
    .select({ id: users.id, username: users.username, role: users.role, created_at: users.created_at, mfa_enabled: users.mfa_enabled, module_permissions: users.module_permissions })
    .from(users)
    .where(inArray(users.role, ["admin", "staff"]))
    .orderBy(asc(users.username));
  res.json(accounts);
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

  if (!username || !password || !role) {
    return res.status(400).json({ error: "Username, password, and role required" });
  }

  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: "Role must be admin, agent, or staff" });
  }

  if (password.trim().length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
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
      module_permissions: role === "staff" ? [] : modulePermissionKeys.slice(),
    });

    const created: CreateAccountResponse = { id, username, role };
    res.status(201).json(created);
  } catch (error) {
    console.error("Account creation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
