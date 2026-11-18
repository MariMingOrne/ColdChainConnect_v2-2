import { randomUUID } from "crypto";

export function generateId(): string {
  return randomUUID();
}

import type { Response } from "express";
import { ZodError } from "zod";

/**
 * Turn a caught error into a response: invalid input (Zod) is a 400 with a
 * readable message; anything else is logged and returned as a generic 500
 * so database details never reach the client.
 */
export function sendRouteError(res: Response, error: unknown, context: string) {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.join(".");
    return res.status(400).json({ error: field ? `${field}: ${issue.message}` : issue?.message ?? "Invalid input" });
  }
  console.error(`${context}:`, error);
  return res.status(500).json({ error: "Internal server error" });
}

/** 429 with a Retry-After header and a human wait time. */
export function sendTooManyAttempts(res: Response, retryAfterSeconds: number, what: string) {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({ error: `Too many ${what}. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).` });
}
