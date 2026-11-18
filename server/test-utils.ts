// Test helpers. Read-only: looks up existing accounts, never creates any.
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";
import { signToken, type TokenPayload } from "./auth";

/** A signed token for an existing account with this role, or null if none exists. */
export async function tokenForRole(role: TokenPayload["role"]): Promise<string | null> {
  const [user] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.role, role)).limit(1);
  return user ? signToken({ userId: user.id, username: user.username, role }) : null;
}
