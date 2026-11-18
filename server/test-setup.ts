import { afterAll } from "vitest";

// Each test file that loads the server opens the pg pool; close it so the run exits.
afterAll(async () => {
  const { closeDb } = await import("./db");
  await closeDb().catch(() => undefined);
});
