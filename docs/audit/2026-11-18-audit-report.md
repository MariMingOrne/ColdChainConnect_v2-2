# ColdChainConnect — Repository Audit (2026-11-18)

Scope: whole repo at commit `d288f73` (branch `main`, clean tree). No code was changed during this audit.

Legend — **Verified**: reproduced or read directly in code/tool output. **Suspected**: strong evidence, not reproduced. **Recommendation**: improvement, not a bug.

## 1. What the system is

**ACDP Cold Chain Connect** is an internal ERP for ACDP Consumer Goods Trading, a frozen/chilled-goods distributor in Pampanga, PH. It runs the whole order-to-cash chain:

`Products & inventory batches → pallets → customer orders (bookings) → order preparation (pallets reserved from stock) → invoices → deliveries (trucks, drivers, routes) → proof of delivery & payment → accounts receivable / returns → reports, sales forecast, audit log`

| Role | What they use |
|---|---|
| **Admin** | Everything (desktop sidebar layout) |
| **Staff** | Admin layout, limited to modules granted per account (`module_permissions`) |
| **Agent** (sales rep) | Mobile-first booking/dispatch screens: take orders, scan barcodes, track pallets, own deliveries, record payments, log returns |
| **Driver** | Only their delivery schedule |

Stack: React 18 + React Router 6 SPA, Vite 8, Tailwind 3, shadcn/ui (installed), Zustand, Express 5, Drizzle ORM + PostgreSQL (Neon), JWT + optional TOTP MFA, ExcelJS import/export, Leaflet maps.

Current visual identity: deep navy (`hsl(230 79% 20%)`) + gold accent, Rajdhani / Barlow / Barlow Condensed (industrial/logistics feel), 14px root font (13px on mobile).

## 2. Baseline checks (actually executed)

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | OK |
| `pnpm typecheck` | **Pass** (0 errors) |
| `pnpm test` | **Pass** — 5 files, 19 tests (client utility logic only; zero server/API tests) |
| `pnpm build` | **Pass** — main JS chunk **2,469 kB (626 kB gzip)**, ExcelJS chunk 930 kB |
| `pnpm audit --prod` | **26 vulnerabilities: 1 critical, 12 high, 10 moderate, 3 low** |
| Lint | Not available — no ESLint config in the repo |
| Database | **Neon reports "account or project has exceeded the quota"** — the app cannot read data right now |
| Browser | Login page renders, no console errors. Logged-in screens **could not be inspected** (no working DB) |

## 3. Findings

### P0 — Critical

**P0-1 · Security · `.env` (Verified)**
Live secrets are committed to a **public** GitHub repo (`MariMingOrne/ColdChainConnect_v2-2`, commit `9dd482c`): the Neon `DATABASE_URL` (includes DB password) and `JWT_SECRET`. `.gitignore` contains `!.env`, which explicitly *un-ignores* it.
- Impact: anyone can connect to the production database (read/alter/delete all customers, invoices, payments) and, if the deployed server uses this secret, forge an admin login token.
- Fix: (1) **Rotate** the Neon database password and generate a new `JWT_SECRET` — only the account owner can do this. (2) Remove `!.env`, add `.env`, `git rm --cached .env`. (3) Optionally purge it from git history (force-push; needs owner approval). Rotation is what actually matters — history is already public.
- Complexity: S. Verify: `git ls-files .env` empty; old DB password rejected.

**P0-2 · Security · `server/index.ts:139`, `server/routes/upload.ts` (Verified)**
`POST /api/upload` has **no authentication**. Anyone on the internet can write files (up to 5 MB each, unlimited count) into `public/uploads/`, which is then served publicly. File type is checked only by filename extension.
- Impact: free public file hosting / disk-fill on your server; storage of arbitrary content under your domain.
- Fix: add `authMiddleware` + `requireRole("admin")`; check MIME type/magic bytes; generate random filenames.
- Complexity: S. Verify: unauthenticated request → 401.

**P0-3 · Reliability · Database (Verified)**
The Neon project has exceeded its quota; every DB-backed request fails. The server prints "Running in demo mode" but in fact only the login route has a demo path — every other route will error.
- Fix: owner action — upgrade/reset Neon quota or point `DATABASE_URL` at another Postgres. Make the server fail loudly at startup instead of pretending.

### P1 — High

**P1-1 · Data integrity · `server/routes/receipts.ts:263-390` (Verified by reading)**
Recording a payment reads the outstanding balance, then performs 4 separate writes (delivery item, receipt, AR, invoice) **with no transaction and no row lock**.
- Impact: two simultaneous submissions (double-tap on a phone, agent + admin at once) both read the same balance → one payment is silently lost from Accounts Receivable. A failure midway leaves invoice/AR disagreeing.
- Fix: wrap in `db.transaction`, `SELECT … FOR UPDATE` the AR row (pattern already used correctly in `pallets.ts`). Also add a `payments` table — partial payments currently overwrite `payment_method`/`payment_reference` so payment history is lost.
- Same pattern (no transaction) in `deliveries.ts`, `invoices.ts`, other `receipts.ts` handlers.

**P1-2 · Security · `server/routes/auth.ts:37-53` (Verified)**
If `DATABASE_URL` is unset, `/api/auth/login` returns an **admin** token for *any* username/password. One missing env var in a deployment = open admin access.
- Fix: allow demo login only when `NODE_ENV !== "production"` *and* an explicit `DEMO_MODE=true`.

**P1-3 · Security · Auth (Verified)**
No rate limiting anywhere. Login and the 6-digit MFA code can be brute-forced (10⁶ codes, 5-minute challenge window, unlimited attempts).
- Fix: rate limit `/api/auth/*` (per IP + per username); lock MFA challenge after ~5 bad codes.

**P1-4 · Security · Dependencies (Verified)**
26 known vulnerabilities, 1 critical (`proxy-addr` via express), high in `multer`, `path-to-regexp`, `body-parser`, `brace-expansion`, `zod`. All except `zod` are fixed by in-range updates (`pnpm update`).

**P1-5 · Security · `server/routes/accounts-receivable.ts:12` (Suspected — depends on intended rules)**
`GET /api/accounts-receivable` (and `inventory-batches`, `agents`, `drivers`, `bookings` lists — to verify per handler) return **all** records to **any** logged-in role, including agents. An agent can read every customer's balances.
- Fix: decide the rule (agents see only their customers?) and scope queries server-side.

**P1-6 · Security · Auth tokens (Verified)**
JWTs live 24 h and are stored in `localStorage`. Logout is a no-op on the server. Deactivating/demoting an admin or agent has no effect until the token expires (only staff permissions are re-checked from the DB).
- Fix: re-check user existence/role in `authMiddleware` (one indexed lookup), or add a `token_version` column.

**P1-7 · Database · `drizzle/`, `package.json` (Verified)**
- `db:migrate` actually runs `drizzle-kit push` (schema sync, can drop columns) — the 16 migration files are never applied by that script. Two files share number `0005_`.
- **Zero indexes** in `schema.ts` (37 foreign keys, none indexed). Postgres does not index FKs automatically → list/join queries degrade as data grows.
- Fix: use `drizzle-kit generate` + `migrate`; add indexes on FK and filter/sort columns (`created_at`, `status`, `customer_id`, `booking_id`, …).

**P1-8 · Frontend · Design system not applied (Verified by measurement)**
shadcn/ui is installed (46 components) but barely used:

| | Hand-rolled | shadcn |
|---|---|---|
| Buttons | 246 `<button>` | 48 `<Button>` |
| Selects | 30 `<select>` | 11 `<Select>` |
| Confirmations | **67 `window.confirm/alert`** | 0 `AlertDialog` |
| Modals | 5 files with custom `fixed inset-0` overlays | 1 `Dialog` |
| Dark mode | 0 `dark:` classes; `.dark` theme incomplete | — |

19 screens import no shadcn components at all (incl. Dashboard, Login, BookingDispatch, SearchResults, DriverSchedule). 28 hard-coded hex colors in TSX. Result: inconsistent look/behaviour between screens, native browser popups on mobile, poor keyboard/screen-reader support.

### P2 — Medium

| ID | Area / File | Finding | Status |
|---|---|---|---|
| P2-1 | `server/auth.ts:51` | `/api/auth/refresh` always throws (`payload already has an "exp" property`). Not called by the client, so sessions just hard-expire at 24 h. | Verified (reproduced) |
| P2-2 | `server/routes/*` | Only 5/26 route files validate input with Zod; others hand-check `req.body`. Several handlers return raw `error.message` to the client (`batches.ts:115`, `bookings.ts:184`, `pallets.ts:217,309`, `inventory-batches.ts`). | Verified |
| P2-3 | `server/index.ts:117` | `cors()` with no origin list — any website may call the API. Low risk today (Bearer token, not cookies) but should be restricted. | Verified |
| P2-4 | `server/routes/auth.ts:183` | Admin can set passwords as short as 4 characters. | Verified |
| P2-5 | client | No error boundary — any render error blanks the whole app. | Verified |
| P2-6 | client | No route-level code splitting (0 `lazy()`); 2.5 MB main chunk. Agents on mobile data download admin-only code (`three`, recharts, leaflet…). | Verified |
| P2-7 | client | Data fetching is ad-hoc `fetch` in 32 files; TanStack Query is installed but used in 1. 16 screens poll every 60 s; Dashboard downloads *all* bookings, products, deliveries each load (no server pagination outside `batches`/`users`). | Verified |
| P2-8 | client | **3,346 lines of dead pages** never routed: `Customer`, `EmployeeManagement`, `Employees`, `FinanceLedger`, `Index`, `PlaceholderPanel`, `Settings`, `modules/MobileBooking`. | Verified |
| P2-9 | repo | 22 user-uploaded images committed in `public/uploads/` (4.9 MB), plus `server/routes/bookings.ts.bak`. | Verified |
| P2-10 | `client/pages/Login.tsx` | Form labels not associated with inputs (screen readers announce unlabeled fields); 10.5 px label text. | Verified in browser |
| P2-11 | `client/global.css:95-110` | Mobile rule forces **every** h1–h6 to the same small size and body to `text-xs` → flat hierarchy, ~11 px body on phones. | Verified |
| P2-12 | tests | Tests import the server which connects to the *real* database at import time. No API/integration tests for auth, permissions, money flows. | Verified |
| P2-13 | docs | 10 top-level docs (`START_HERE`, `ARCHITECTURE`, …) describe an older 2-role system ("admin \| driver", "11 tables"); actual schema has 22 tables and 4 roles. Misleading for new contributors. | Verified |

### P3 — Low

- No ESLint/Prettier enforcement in CI; `package.json` name is still `fusion-starter`.
- Leftover starter endpoints `/api/ping`, `/api/demo`; `VITE_PUBLIC_BUILDER_KEY` unused.
- React Router v7 future-flag warnings in console.
- `browserslist` data 15 months old.
- `authMiddleware` runs twice per request (global `/api` guard + per-route), doubling the staff DB lookup.

## 4. Area assessments

| Area | Assessment |
|---|---|
| **Overall** | Feature-rich and genuinely functional domain logic (stock reservation, credit terms, routing, MFA). Held back by secret exposure, a few unprotected/unatomic paths, and an unapplied design system. |
| Backend | Clear route-per-resource structure; role checks mostly present. Weak spots: transactions on money paths, input validation, error leakage. |
| Security | **Poor until P0-1/P0-2 are fixed.** Good: bcrypt, MFA, prod JWT_SECRET guard, server-side staff permission default-deny. |
| Database | Sensible normalized schema with decimal money columns and FKs. Missing indexes and a real migration workflow. |
| Performance | Untested at scale (no DB). Bundle size and full-table fetches are the known risks. |
| Accessibility | Weak — native confirm dialogs, unlabeled inputs, tiny mobile text, no dark theme. |
| Testing | Minimal: 19 unit tests, no server tests. |
| Design | Has a real identity (navy/gold, industrial type) but applied inconsistently screen-to-screen. |
| Tech debt | ~3.3k lines dead UI, stale docs, duplicated fetch/auth-header code. |

## 5. Proposed roadmap

1. **Security & secrets** — P0-1 (with owner), P0-2, P1-2, P1-3, P1-4, P2-3, P2-4.
2. **Money/data integrity** — P1-1 transactions + payment history, P1-6, P2-1.
3. **Backend reliability** — Zod validation, consistent error handler, P1-5 scoping, P1-7 indexes/migrations, server tests.
4. **Design system** — tokens, type scale, complete light/dark theme, shared layout (shadcn Sidebar), shared page/table/empty/loading/error primitives.
5. **Screen-by-screen redesign on shadcn** — Login → Dashboard → Information Management → Booking & Dispatch (admin) → Agent mobile flow → Driver → Accounts/Audit/Reports. Replace all `confirm/alert` with AlertDialog + Sonner.
6. **Performance** — route-level `lazy()`, TanStack Query, server pagination.
7. **Accessibility pass + screenshot QA** at 375 / 768 / 1280 / 1920 px.
8. **Cleanup & docs** — remove dead pages (with approval), consolidate docs, ESLint.

## 6. Checks not performed (and why)

- Logged-in UI review, screenshots, responsive QA, chart-data verification: **blocked by the Neon quota** (no data, no login).
- Load/performance profiling: same reason.
- Penetration testing against a deployed instance: out of scope / not authorized.

---

## 7. Status after branch `audit/security-and-ui-overhaul`

Every "Fixed" item below has a test or a recorded browser check. "Not done" means exactly that.

| ID | Status | What changed / why not |
|---|---|---|
| P0-1 secrets in git | **Partly** | `.env` untracked and ignored; local `JWT_SECRET` regenerated. **Still required:** rotate the old Neon password and the deployed `JWT_SECRET` (needs account access), optionally purge history (force-push). |
| P0-2 open upload | Fixed | Admin-only, magic-byte check, random filenames. Tests. |
| P0-3 DB quota | Worked around | Development points at a teammate's Neon DB (local `.env` only). |
| P1-1 payment race | **Partly** | `recordDeliveryItemPayment` now one transaction with row locks. **Not done:** a `payments` history table (schema change on a shared DB) and transactions in `deliveries.ts` / `invoices.ts`. |
| P1-2 demo admin login | Fixed | Needs `DEMO_MODE=true` outside production; else 503. Test. |
| P1-3 brute force | Fixed | 5 tries per username, 30 per IP, 5 MFA codes, per 15 min; proxy-aware. In-memory per instance (serverless instances count separately). Tests. |
| P1-4 dependencies | Fixed | 26 → 8 advisories; remaining 8 are exceljs transitive paths this app does not reach. |
| P1-5 agent data scope | Fixed | Invoices, receipts, AR, returns scoped to the agent's orders. Drivers cannot reach these routes at all. Tests. |
| P1-6 stale tokens | Fixed | Account and role re-checked per request; client signs out on 401. Tests. |
| P1-7 indexes / migrations | **Partly** | 44 indexes declared + `drizzle/0016_add_indexes.sql` (additive). **Not applied** to any DB. `db:migrate` still runs `push`; the migration journal is out of sync (tracks 5 of 17 files). |
| P1-8 design system | **Partly** | Tokens, dark mode, shadcn-compatible theme, dialogs/toasts, shared StatCard, quiet row actions, Login on shadcn. **Not done:** ~245 hand-written `<button>`s and 5 custom overlays still to move onto shadcn components screen by screen. |
| P2-1 refresh crash | Fixed | Test. |
| P2-2 validation / leaks | **Partly** | No raw DB errors in responses (`sendRouteError`). Zod still only in 5 of 26 route files. |
| P2-3 CORS | Fixed | Same-origin unless `CORS_ORIGIN` is set. Test. |
| P2-4 4-char passwords | Fixed | 8 minimum for new/changed passwords. Test. |
| P2-5 error boundary | Fixed | RouteBoundary. |
| P2-6 bundle | Fixed | Route code-splitting: 2,510 kB → 225 kB main chunk. |
| P2-7 data fetching | **Partly** | Dashboard + nav badges on TanStack Query with a server summary (~1.1 MB → ~26 KB per dashboard load). Other screens unchanged. |
| P2-8 dead pages | Kept | Owner decision: keep. Only colour tokens changed in them. |
| P2-9 uploads in git | **Partly** | `.bak` removed. Uploaded images left tracked: product records reference them, removing them would break images for everyone who pulls. Needs object storage first. |
| P2-10 login labels | Fixed | Browser-verified. |
| P2-11 tiny mobile type | Fixed | 12 px minimum; mobile heading override removed. |
| P2-12 tests hit real DB | **Partly** | Builds no longer connect. API tests still read the configured DB (read-only) and are skipped without one. |
| P2-13 stale docs | Not done | |
| — audit filters (new) | Fixed | `?action=` / `?user_id=` returned nothing. Test. |
| — driver schedule (new) | Fixed | Drivers were 403 on their own schedule (also on main). Test. |
| — misleading figures (new) | Fixed | Reports' overlapping-period bars; Delivery History "Paid Invoices" showed the delivery count. |

Measured: Hallmark sloplint 226 → 50 FAIL (remaining: recorded waivers, kept dead pages, nested-card follow-ups); contrast 22 failing elements → 0 (light and dark, dashboard); tests 19 → 43.
