import { afterAll } from "vitest";

// Specs that load the real server db open a pg pool; close it so the run exits.
// db/index.ts flags itself when it is loaded, so specs that mock "./db" (PGlite harness) never open
// a connection to the shared database from here.
afterAll(async () => {
  if (!(globalThis as { __coldchainPoolOpen?: boolean }).__coldchainPoolOpen) return;
  const { closeDb } = await import("./db");
  await closeDb().catch(() => undefined);
});
