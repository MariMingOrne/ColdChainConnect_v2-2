# Role Flows and Accounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every role's flow (admin, accounting/staff, agent, driver) complete and correct, and give the Accounting role real multi-step approvals, as found in the 2026-11-19 audit.

**Architecture:** One permission table in `shared/permissions.ts` is the single source of truth. The server enforces it through `requirePermission`; the client mirrors it through `useCan` so screens hide what the server would reject. Accounting adds two controls: payment verification on top of field-recorded payments, and an expense workflow (submit, approve, pay) with distinct actors.

**Tech Stack:** React 18 + TypeScript, Express, Drizzle ORM on Postgres (Neon), Vitest, shadcn/ui, pnpm.

**Spec:** the Design section of this file; evidence is in the memory note `flow-audit-findings`.

## Design (decisions made by the builder; the user delegated them)

- **D1 Roles.** admin = owner (everything, overrides are audit-logged). staff = Accounting, limited by module permissions. agent and driver keep their field screens.
- **D2 New module permission `accounting`.** Added to `modulePermissionKeys` (stored as jsonb strings, so no migration). Gates accounting writes and screens. Label: "Accounting".
- **D3 Payment verification.** Payments stay recorded in the field (agent, driver or admin). Verification is a separate control: `receipts` gains `payment_verified_by` and `payment_verified_at` (nullable). Accounting (or admin) verifies or flags each recorded payment from a queue. Totals and `payment_status` semantics do not change.
- **D4 Expenses.** New `expenses` table. Status flow: `submitted -> approved | rejected -> paid`. Accounting submits and pays; admin approves or rejects. The approver may not be the submitter; the payer may not be the approver (server enforces, 409).
- **D5 Order approval.** Stays admin-only. `bookings` gains `approved_by` and `approved_at`. Self-approval (creator = approver) is allowed but recorded as such in the audit log.
- **D6 Scoping.** Drivers see only invoices, receipts and receivables for their own deliveries. Agents keep existing scoping. Staff are unscoped within their modules.
- **D7 Cleanup.** The mock `FinanceLedger.tsx` is replaced by the real Expenses screen. Other unrouted screens are left in place and listed in the final report (the user asked to keep them).
- **D8 Database safety.** All schema changes are additive (nullable columns, new tables). Tests run in-process on PGlite, never on the shared Neon database. Migration SQL is written to `drizzle/` but not applied to Neon by this plan.

## Global Constraints

- Prefer pnpm. Typecheck with `pnpm typecheck`, tests with `pnpm test`.
- Only add an endpoint when the client genuinely needs it (project rule).
- Use shadcn components; tables use `components/ui/table`; row actions open `PageDialog` modals, never full-page swaps.
- Conventional commit messages, small checkpoint commits, no Claude co-author line.
- Never write to the shared Neon database from tests or scripts.

## Review Focus

- A staff user with only `accounting` (no other module) must still reach the Accounting screens and nothing else.
- A driver token must not read other drivers' invoices, receipts or receivables.
- Two requests approving the same expense or verifying the same payment at once: the second gets 409, not a double write.
- An expense of zero, negative or non-numeric amount is rejected (400).
- Existing admin and agent flows (booking to payment) behave exactly as before.

---

### Task 1: PGlite test harness

**Files:**
- Create: `server/test/test-db.ts`
- Modify: `package.json` (devDependency `@electric-sql/pglite`)
- Test: `server/test/test-db.spec.ts`

**Interfaces:**
- Produces: `createTestDb(): Promise<{ db: NodePgDatabase<typeof schema>-compatible drizzle instance; close(): Promise<void> }>` that creates all tables from `server/db/schema.ts` in a fresh in-memory PGlite. Plus `seedUsers(db): Promise<{ admin, staff, agent, driver }>` returning user rows with ids.

- [ ] Write a failing spec that creates the db, seeds users and selects them back.
- [ ] Implement using `drizzle-orm/pglite` and `drizzle-kit/api` `pushSchema`.
- [ ] Run `pnpm test server/test/test-db.spec.ts`; expect PASS.
- [ ] Commit `test: add in-memory Postgres harness`.

### Task 2: Single permission table and server guard

**Files:**
- Create: `shared/permissions.ts`, `server/middleware/permissions.ts`
- Modify: `shared/api.ts` (add `accounting` to `modulePermissionKeys` and labels), `server/index.ts` (replace the inline staff guard, use `requirePermission`)
- Test: `server/middleware/permissions.spec.ts`

**Interfaces:**
- Produces in `shared/permissions.ts`: `type Action` (string union covering every write and gated read, e.g. `"booking:approve"`, `"invoice:markPaid"`, `"payment:verify"`, `"expense:submit"`, `"expense:approve"`, `"expense:pay"`, `"return:decide"`, `"delivery:confirm"`), `can(user: {role; module_permissions?}, action: Action): boolean`, and `STAFF_API_MODULES: Record<string, ModulePermission[]>` mapping API prefixes to modules.
- Produces: `requirePermission(action: Action): RequestHandler` (403 with `{error}` when `can` is false) and `staffModuleGuard: RequestHandler` that uses `STAFF_API_MODULES`.
- Fixes audit gap 1: `/bookings` must be mapped (to `order-fulfillment`).

- [ ] Failing tests: staff with `order-fulfillment` passes for `/bookings`; staff without it gets 403; admin always passes; `can(agent, "invoice:markPaid")` is false; unmapped `/api` path denies staff.
- [ ] Implement the table and guards; swap `server/index.ts` to use them, keeping every existing `requireRole` behavior identical for admin.
- [ ] Run `pnpm test` and `pnpm typecheck`; expect PASS.
- [ ] Commit `fix(auth): map /bookings for staff and centralize permissions`.

### Task 3: Scope driver reads

**Files:**
- Modify: `server/services/agent-bookings.ts` (generalize `agentInvoiceScope` so role `driver` is scoped to invoices on their own deliveries), `server/routes/{invoices,receipts,accounts-receivable,agent-returns}.ts` as needed
- Test: `server/routes/driver-scoping.spec.ts` (uses Task 1 harness)

**Interfaces:**
- Consumes: Task 1 `createTestDb`, `seedUsers`.
- Produces: unchanged function names; `agentInvoiceScope(req)` returns the driver's invoice id list for drivers.

- [ ] Failing test: driver A cannot list invoice, receipt or receivable rows that belong only to driver B's delivery; can read their own.
- [ ] Implement the driver branch.
- [ ] Run `pnpm test`; expect PASS. Commit `fix(auth): scope driver reads to their own deliveries`.

### Task 4: Client permissions and role-aware UI

**Files:**
- Create: `client/hooks/useCan.ts`
- Modify: screens that show admin-only actions: `BookingSummary.tsx`, `Delivery.tsx`, `AccountsReceivable.tsx`, `Invoicing.tsx`, `AgentReports.tsx` (admin view), `Pricing.tsx`, `Customers.tsx`, `Agents.tsx`, `Drivers.tsx`, `Inventory.tsx`
- Test: `client/hooks/useCan.spec.tsx`

**Interfaces:**
- Consumes: Task 2 `can`, `Action`.
- Produces: `useCan(action: Action): boolean` reading the auth store.

- [ ] Failing test: staff without `accounting` gets false for `payment:verify`; admin true.
- [ ] Implement the hook, then hide or disable each action button on the listed screens when `useCan` is false (read-only screens show no dead buttons).
- [ ] Run `pnpm test` and `pnpm typecheck`; commit `feat(ui): hide actions the user's role cannot perform`.

### Task 5: Driver delivery actions

**Files:**
- Modify: `client/components/driver/DriverStopCard.tsx`, `client/components/driver/DriverScheduleView.tsx`
- Test: `client/components/driver/DriverStopCard.spec.tsx`

**Interfaces:**
- Consumes: existing endpoints `POST /api/deliveries/:id/items/:itemId/confirm` and `/payment` (already allow the assigned driver).
- Produces: a stop card with "Confirm delivery" and "Record payment" actions that open `PageDialog` modals and refresh the schedule.

- [ ] Failing test: card renders both actions for a pending stop and calls the confirm endpoint with the bearer token.
- [ ] Implement, mirroring the agent flow in `AgentDeliverySchedule.tsx` for payment fields.
- [ ] Commit `feat(driver): confirm deliveries and record payments from the schedule`.

### Task 6: Schema additions and migration SQL

**Files:**
- Modify: `server/db/schema.ts` (`bookings.approved_by`, `bookings.approved_at`, `receipts.payment_verified_by`, `receipts.payment_verified_at`; new `expenses` table with `id, category, description, amount decimal(12,2), status varchar(20), submitted_by, approved_by, paid_by, reject_reason, created_at, updated_at, approved_at, paid_at`)
- Create: `drizzle/0009_accounting.sql` (additive SQL only)
- Modify: `shared/api.ts` (`Expense`, `ExpenseStatus`, request/response types)
- Test: extend `server/test/test-db.spec.ts` to insert and read an expense.

- [ ] Failing test, implement schema, write the SQL by hand matching the schema, run `pnpm test`; commit `feat(db): add approval and expense columns`.

### Task 7: Payment verification

**Files:**
- Create: `server/routes/payment-verification.ts`
- Modify: `server/index.ts` (routes `GET /api/payments/unverified`, `POST /api/receipts/:id/verify`), `server/routes/bookings.ts` (set `approved_by`/`approved_at`, audit `selfApproved`)
- Test: `server/routes/payment-verification.spec.ts`

**Interfaces:**
- Consumes: Task 2 `requirePermission("payment:verify")`, Task 1 harness.
- Produces: `GET /api/payments/unverified -> Receipt[]` (recorded, not verified), `POST /api/receipts/:id/verify -> Receipt` (409 if already verified).

- [ ] Failing tests: accounting verifies once (200) and again (409); agent gets 403; verified rows leave the unverified list; verification is audit-logged with the actor.
- [ ] Implement with a conditional update (`where payment_verified_at is null`) so concurrent calls cannot double-write.
- [ ] Commit `feat(accounting): verify field-recorded payments`.

### Task 8: Expense workflow (server)

**Files:**
- Create: `server/routes/expenses.ts`
- Modify: `server/index.ts` (`GET/POST /api/expenses`, `POST /api/expenses/:id/approve|reject|pay`)
- Test: `server/routes/expenses.spec.ts`

**Interfaces:**
- Produces: `listExpenses`, `createExpense` (requires `expense:submit`; amount must be a positive number, else 400), `approveExpense` (`expense:approve`; 409 unless status `submitted`; 409 if approver is submitter), `rejectExpense` (requires `reject_reason`), `payExpense` (`expense:pay`; 409 unless `approved`; 409 if payer is approver).

- [ ] Failing tests cover every transition, both 409 actor rules, the 400 amount rule and 403 for wrong roles.
- [ ] Implement with conditional updates on status; audit-log each step.
- [ ] Commit `feat(accounting): expense submit, approve and pay workflow`.

### Task 9: Accounting screens

**Files:**
- Create: `client/pages/modules/PaymentVerification.tsx`, `client/pages/modules/Expenses.tsx`
- Modify: `client/components/AdminNavigation.tsx`, `client/components/BottomNavBar.tsx`, `client/pages/ManageAccounts.tsx` or `BookingDispatch.tsx` routes as needed, `client/App.tsx` (routes under the persistent layout, `StaffModule permission="accounting"`), `client/pages/modules/ManagedUsers.tsx` (accounting toggle appears via `modulePermissionKeys`)
- Delete: `client/pages/FinanceLedger.tsx`
- Test: `client/pages/modules/Expenses.spec.tsx`

**Interfaces:**
- Consumes: Task 7 and 8 endpoints, Task 4 `useCan`, `lib/unseen.ts` (add `SeenKey` `expenses` and `payments`, with counts in `server/routes/unseen.ts`).
- Produces: sidebar group "Accounting" with "Payments to verify" and "Expenses"; consistent shadcn tables; actions as `PageDialog` modals; status badges.

- [ ] Failing test: Expenses lists rows and shows only the actions `useCan` allows for the signed-in role.
- [ ] Implement both screens and wiring; verify in the browser as admin; commit `feat(accounting): payment verification and expense screens`.

### Task 10: Role-by-endpoint matrix and fixes

**Files:**
- Create: `server/routes/role-matrix.spec.ts`
- Modify: whatever the matrix exposes (fixes belong in the owning route file)

- [ ] Write a table-driven spec: for each of admin, staff(accounting), staff(no modules), agent, driver, assert the expected status class (2xx vs 403) for every route in `server/index.ts`. Run it; each unexpected result is either fixed in the owning file or recorded as intended in the table.
- [ ] Commit `test: role by endpoint matrix`.

### Task 11: Whole-branch sweep

- [ ] Run `pnpm typecheck`, `pnpm test`, `pnpm build`.
- [ ] Drive each role through its flow in the browser (admin, accounting, agent, driver) with the local dev server; note and fix anything broken (permission misses, dead buttons, loading states, mobile layout).
- [ ] Update the memory notes, list unrouted screens left in place, and report what was and was not verified.
