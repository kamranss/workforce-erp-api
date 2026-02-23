# ArchBuild Backend (Portfolio Copy)

Backend API for workforce and field-operations management, built with Vercel Serverless Functions and MongoDB.

This repository is a portfolio-safe copy of a production-style app. It demonstrates architecture, API design, role-based access control, and reporting logic.

## What This App Does

- Authenticates users with passCode-based login and JWT sessions.
- Manages users, projects, tasks, time tracking, payments, expenses, and bonuses/penalties.
- Enforces role-based permissions (`user`, `admin`, `superAdmin`).
- Calculates business reports on read (hours, earnings, liabilities, project breakdowns).
- Supports geofence-aware check-in/check-out for ongoing projects.

## Tech Stack

- Runtime: Node.js 18+
- API platform: Vercel Functions (`/api/*`)
- Database: MongoDB + Mongoose
- Auth: `jsonwebtoken`
- Password/passCode hashing: `bcryptjs`

## Architecture Summary

- `api/`: HTTP endpoints (serverless handlers)
- `src/models/`: Mongoose schemas
- `src/validation/`: payload validation per domain
- `src/helpers/`: shared domain logic, response helpers, reporting helpers
- `src/middleware/`: authentication and role authorization
- `src/db/`: MongoDB connection cache for serverless runtime
- `scripts/`: one-time seed utilities

## Core Features

### Authentication

- `POST /api/auth/login`: passCode login, returns JWT + user profile.
- `GET /api/auth/me`: token-based current user lookup.

### Users and Access Control

- Cursor-paginated user listing.
- Create, update, soft-delete users.
- Strict role rules apply:
- `admin` can manage only `role=user` records.
- `superAdmin` can manage `admin` and `superAdmin` records.

### Projects

- Create and update project lifecycle (`waiting`, `ongoing`, `finished`, `canceled`).
- Optional quote fields and geolocation metadata.
- Active/ongoing filtered endpoints.

### Time Tracking

- Geofence-aware check-in/check-out.
- Admin manual entry options.
- Daily break logic with automatic 60-minute adjustment when threshold is exceeded.
- Hours reporting with pagination and date-range presets.

### Finance and Operations

- Payments CRUD (role-scoped).
- Expenses CRUD (admin/superAdmin scope).
- Bonus and penalty records with role-safe visibility.
- User and project summary reporting endpoints.

### Dashboard and Tasking

- Daily dashboard for open entries and workload views.
- Task CRUD and role-aware task visibility.

## Role Model

- `user`
- `admin`
- `superAdmin`

## API Design Notes

- Success response format: `{ ok: true, data: ... }`
- Error response format: `{ ok: false, error: { code, message, details? } }`
- Many record-specific endpoints use query-param ID routes.
- Example: `/api/users/id?id=<mongoObjectId>`

## Environment Variables

Copy `.env.example` and set values.

- `MONGODB_URI` (required)
- `MONGODB_DB_NAME` (optional)
- `JWT_SECRET` (required, minimum 32 chars)
- `JWT_EXPIRES_IN` (optional, default `60m`)
- `ALLOWED_ORIGINS` (optional, comma-separated CORS allowlist)

Optional seed variables for super admin creation:

- `SEED_SUPERADMIN_NAME`
- `SEED_SUPERADMIN_SURNAME`
- `SEED_SUPERADMIN_EMAIL`
- `SEED_SUPERADMIN_PASSCODE` (exactly 6 digits)
- `SEED_SUPERADMIN_PAYMENT_OPTION` (`hourly` or `monthly`, default `monthly`)
- `SEED_SUPERADMIN_PAYMENT_AMOUNT` (default `0`)

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
copy .env.example .env.local
```

3. Run Vercel dev server:
```bash
vercel dev
```

4. Health check:
```bash
curl http://localhost:3000/api/health
```

## Seeding

Create first super admin:
```bash
npm run seed:superadmin
```

Insert initial demo users:
```bash
npm run seed:users
```

## Deployment (GitHub + Vercel)

1. Push this repo to GitHub.
2. Import the repo into Vercel.
3. Set all required environment variables in Vercel Project Settings.
4. Deploy from `main` branch.

## Security Notes

- Do not commit `.env` or `.env.local`.
- Rotate secrets if exposed.
- Keep `JWT_SECRET` strong and private.
- Use a dedicated MongoDB user with least privilege.
- Add request rate limiting for `/api/auth/login` in production-facing deployments.

## Portfolio Scope

This codebase is presented as a backend engineering portfolio project.

- Focus: API design, role-safe data access, reporting logic, and production-style structure.
- Data in this copy can be demo/non-business data.
- Real credentials and secrets must be managed only through local env files and Vercel environment variables.
