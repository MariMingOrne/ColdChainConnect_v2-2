# Project Structure

This document describes the current Cold Chain Connect application layout. It is a high-level guide; for implementation details, use the source files listed below.

## Top-level layout

```text
.
├── client/                 # React SPA, routes, UI, and browser-side libraries
├── server/                 # Express API, database access, middleware, and services
├── shared/                 # Types and permissions used by client and server
├── public/                 # Static assets
├── drizzle/                # Database migration output/configuration
├── package.json            # Scripts and dependencies
├── vite.config.ts          # Client and integrated development server config
├── vite.config.server.ts   # Production server build config
├── drizzle.config.ts       # Drizzle configuration
├── tailwind.config.ts      # Tailwind theme configuration
└── tsconfig.json           # TypeScript configuration
```

## Client

```text
client/
├── App.tsx                 # Authentication-aware application layouts and top-level routes
├── global.css              # Global styles and design tokens
├── context/                # Shared React context, including inventory state
├── hooks/                  # Auth, permissions, refresh, notifications, and UI hooks
├── components/             # Shared navigation, dialogs, forms, maps, tables, and UI primitives
│   ├── pallets/            # Pallet tables, labels, and batch breakdowns
│   ├── driver/             # Driver delivery schedule UI
│   ├── delivery/           # Dispatch and truck-load UI
│   ├── shared/             # Shared layout and delivery components
│   └── ui/                 # Reusable Radix-based UI components
├── lib/                    # Client utilities and focused unit tests
└── pages/                  # Route-level screens
    ├── modules/            # Customer, pricing, booking, delivery, agent, reports, and audit screens
    │   └── audit/          # Audit reports and report data components
    └── ...                 # Dashboard, Inventory, Accounting, Reports, and other page shells
```

Primary route groups are defined in `client/App.tsx`. Information Management routes are composed in `client/pages/InformationManagement.tsx`; booking and dispatch routes are composed in `client/pages/BookingDispatch.tsx`. Layout and access depend on the authenticated role (admin, staff, agent, or driver).

## Server

```text
server/
├── index.ts                # Express app, middleware, and API route registration
├── auth.ts                 # Password and token helpers
├── db/
│   ├── index.ts            # Database connection and Drizzle setup
│   └── schema.ts           # PostgreSQL schema and relations
├── middleware/             # Authentication, permissions, rate limits, and audit logging
├── routes/                 # API handlers, generally organized by domain
├── services/               # Shared business logic used by route handlers
├── seed.ts                 # Demo database seed
├── seed-products.ts        # Demo product data
├── reset.ts                # Full database reset helper
└── test-utils.ts           # Server test helpers
```

API routes are registered in `server/index.ts`. Route modules cover authentication and users, customers, products, inventory batches, pallets, bookings, invoices, deliveries, drivers, agents, trucks, receipts, returns, expenses, reporting, and other application services. Authorization is enforced through middleware and route-level permission checks.

## Shared code

- `shared/api.ts` defines shared API and domain types.
- `shared/permissions.ts` defines permission-related shared types and rules.

## Database schema

The Drizzle schema is in `server/db/schema.ts`. It currently defines these 28 tables:

- Users, customers, customer discounts, agents, drivers, and trucks
- Products, product costs, inventory batches, batch pallets, and pallet items
- Bookings, booking items, order item reservations, order pallets, and order pallet items
- Invoices, invoice items, deliveries, and delivery items
- Receipts, receipt payment entries, accounts receivable, and invoice credit applications
- Agent returns, cash remittances, audit logs, and expenses

Use `server/db/schema.ts` as the source of truth for columns, constraints, and relationships.

## Commands

The package manager is pnpm. The main scripts are defined in `package.json`:

```bash
pnpm dev
pnpm build
pnpm start
pnpm typecheck
pnpm test
pnpm db:push
pnpm db:migrate
pnpm db:studio
pnpm db:seed
pnpm db:reset
```

`pnpm db:reset` drops and recreates the database schema before reseeding. Do not use it on a database containing data you need to preserve.
