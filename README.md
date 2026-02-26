# ArchBuild Backend (`/node`)

Vercel Functions backend for iterative migration from Apps Script.

## Iteration 1.1 implemented
- Auth:
  - `POST /api/auth/login` (passCode-only login)
  - `GET /api/auth/me` (JWT required)
- Users:
  - `GET /api/users` (admin + superAdmin, cursor pagination, default limit=10, supports `q` filter by name/surname)
  - `POST /api/users`:
    - admin can create only `role=user`
    - superAdmin can create `role=user` or `role=admin`
  - `GET /api/users/id?id=<userId>` (admin + superAdmin only)
  - `PATCH /api/users/id?id=<userId>`:
    - admin can update only users with `role=user` and cannot change role
    - superAdmin can update users/admins and change roles
  - `DELETE /api/users/id?id=<userId>`:
    - soft delete (`isActive=false`)
    - admin can delete only `role=user`
    - superAdmin can delete users/admins and manage superAdmin records
- Projects:
  - `GET /api/projects` (admin + superAdmin, cursor pagination + filters)
  - `GET /api/projects/search-for-expenses` (admin + superAdmin; cursor pagination + search by project/customer fields for expense modal)
  - `GET /api/projects/ongoing` (user/admin/superAdmin; ongoing + active only)
  - `GET /api/projects/active` (admin + superAdmin; active any status)
  - `POST /api/projects` (admin + superAdmin)
  - `GET /api/projects/id?id=<projectId>` (admin + superAdmin)
  - `PATCH /api/projects/id?id=<projectId>` (admin + superAdmin)
  - `DELETE /api/projects/id?id=<projectId>` (superAdmin only, soft delete)
- Time Entries:
  - `POST /api/time-entries/check-in` (user only, geofence required)
  - `POST /api/time-entries/check-out` (user only, geofence required)
  - `POST /api/time-entries/admin-create` (admin + superAdmin)
- `GET /api/time-entries` (user own only, admin/superAdmin all)
- `GET /api/time-entries/my-open` (user only)
- `GET /api/time-entries/my-recent` (user only, default last 14 days)
- `GET /api/time-entries/hours-report` (user own hours; admin/superAdmin can filter by user)
- `GET /api/time-entries/id?id=<id>` (user own only, admin/superAdmin any)
  - `PATCH /api/time-entries/id?id=<id>` (admin + superAdmin)
  - `DELETE /api/time-entries/id?id=<id>` (superAdmin only, soft delete)
- Bonus & Penalties:
  - `POST /api/bonus-and-penalties` (admin + superAdmin)
  - `GET /api/bonus-and-penalties` (user own only; admin + superAdmin can filter any user)
  - `PATCH /api/bonus-and-penalties/id?id=<id>` (admin + superAdmin)
  - `DELETE /api/bonus-and-penalties/id?id=<id>` (superAdmin only, soft delete)
- Payments:
  - `POST /api/payments` (admin + superAdmin)
  - `GET /api/payments` (user own only; admin + superAdmin can filter any user)
  - `GET /api/payments/id?id=<id>` (admin + superAdmin)
  - `PATCH /api/payments/id?id=<id>` (admin + superAdmin)
  - `DELETE /api/payments/id?id=<id>` (superAdmin only, soft delete)
- Customer Payments (project-linked customer receipts):
  - `POST /api/customer-payments` (admin + superAdmin)
  - `GET /api/customer-payments` (admin + superAdmin, cursor pagination + filters)
  - `GET /api/customer-payments/id?id=<id>` (admin + superAdmin)
  - `PATCH /api/customer-payments/id?id=<id>` (admin + superAdmin)
  - `DELETE /api/customer-payments/id?id=<id>` (admin + superAdmin, soft delete)
- Expenses:
  - `POST /api/expenses` (admin + superAdmin)
  - `GET /api/expenses` (admin + superAdmin)
  - `GET /api/expenses/id?id=<id>` (admin + superAdmin)
  - `PATCH /api/expenses/id?id=<id>` (admin + superAdmin)
  - `DELETE /api/expenses/id?id=<id>` (superAdmin only, soft delete)
- Reports (computed on read):
  - `GET /api/reports/user-summary?userId=...&from=...&to=...` (admin + superAdmin)
  - `GET /api/reports/project-summary?projectId=...&from=...&to=...` (admin + superAdmin)
  - `GET /api/reports/project-user-breakdown?from=...&to=...` (admin + superAdmin)
  - `GET /api/reports/customer-payments-overview?from=...&to=...` (admin + superAdmin; ongoing projects paid vs remaining report)
  - `GET /api/reports/me?from=...&to=...&limit=30&paymentsCursor=...&bonusCursor=...` (user only, bonus/payment totals + lists)
  - `GET /api/reports/me-earnings?year=2026&limit=30&cursor=...` (user only, yearly labor + pending + hours list)
- Dashboard:
  - `GET /api/dashboard/today` (admin + superAdmin)
  - `GET /api/dashboard/open-entries` (admin + superAdmin)
  - `GET /api/dashboard/my-tasks` (user only)
- Tasks:
  - `GET /api/tasks` (user assigned-only; admin/superAdmin all with filters)
  - `POST /api/tasks` (admin + superAdmin)
  - `GET /api/tasks/id?id=<id>` (user assigned-only; admin/superAdmin any)
  - `PATCH /api/tasks/id?id=<id>` (admin + superAdmin)
  - `DELETE /api/tasks/id?id=<id>` (superAdmin only, soft delete)

## Routing note
This project intentionally uses `api/users/id.js` instead of a dynamic filename route.
Use `id` as query param:
- `/api/users/id?id=65f...`
- `/api/projects/id?id=65f...`
- `/api/projects/search-for-expenses`
- `/api/customers/search-for-project-picker`
- `/api/projects/ongoing`
- `/api/projects/active`
- `/api/time-entries/id?id=65f...`
- `/api/time-entries/my-open`
- `/api/time-entries/my-recent`
- `/api/time-entries/hours-report`
- `/api/tasks/id?id=65f...`
- `/api/bonus-and-penalties/id?id=65f...`
- `/api/payments/id?id=65f...`
- `/api/customer-payments/id?id=65f...`
- `/api/expenses/id?id=65f...`

## Project model (Iteration 2)
- `description` (required string)
- `status` (enum: `waiting | ongoing | finished | canceled`, default `waiting`)
- `isActive` (boolean, default `true`)
- `quoteNumber` (optional string)
- `quoteAmount` (optional number, `>= 0`)
- `estimatedStartAt` (optional date)
- `locationKey` (auto-generated from address when omitted; can still be provided manually)
- `address.raw` (required string)
- `address.normalized` (optional string; auto-filled when geocoding succeeds)
- `address.lat` / `address.lng` (optional numbers; auto-filled when geocoding succeeds)
- `geo.lat` / `geo.lng` (optional numbers; auto-filled when geocoding succeeds, required when status is `ongoing`)
- `geoRadiusMeters` (number, default `500`)

Status meanings:
- `waiting`: created, not started
- `ongoing`: active work in progress
- `finished`: completed
- `canceled`: stopped/canceled

## Geofence rules (Iteration 3)
- Check-in and check-out are allowed only when:
  - project is `isActive=true`
  - project `status=ongoing`
  - project has `geo.lat` and `geo.lng`
  - provided `geoIn` / `geoOut` is within radius
- Check-in project selection:
  - `projectIdIn` is optional.
  - If omitted, backend auto-selects nearest eligible ongoing project within radius.
  - If no nearby project matches, API returns `NO_MATCHING_PROJECT`.
- Radius used:
  - `project.geoRadiusMeters` if set
  - otherwise default `500` meters
- Check-out requires `projectIdOut` and validates geo against that output project.

## Daily break rule (Iteration 3.1)
- Time entries store:
  - `rawMinutes` (clockOutAt - clockInAt)
  - `breakMinutes`
  - `minutesWorked = rawMinutes - breakMinutes` (never below 0)
- For each user and local day (`America/Chicago`, grouped by `clockInAt` day):
  - Apply a single `60` minute break once per day.
  - Break is allocated to the first checked-out entry of that day.
  - Break is applied only when that first closed entry has at least `180` raw minutes (3 hours).
  - If break applies and that entry has less than `60` raw minutes, break is clamped to that entry raw minutes.

## User hours payload shape
- User-facing time-entry list endpoints now return project labels and earned amount:
  - `projectIn` / `projectOut` objects with `description`, `locationKey`, and `address`.
  - `earnedAmount` computed from `minutesWorked` and `hourlyRateAtTime`.
- Raw `geoIn` / `geoOut` coordinates are omitted from user-facing list responses.

## Hours report filters
`GET /api/time-entries/hours-report` supports:
- `rangePreset`: `last15 | previous15 | thisMonth | previousMonth | custom`
- `from` and `to` (required when `rangePreset=custom`)
- `userId` (admin/superAdmin only)
- `limit`, `cursor`

Response includes:
- `summary.totalMinutes`
- `summary.totalHours`
- `summary.totalEarned`
- paginated `items`

## Environment variables
Copy `.env.example` and set:
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `JWT_SECRET`
- `JWT_EXPIRES_IN` (default `60m`)

## Response format
- Success: `{ ok: true, data: ... }`
- Error: `{ ok: false, error: { code, message, details? } }`

## Role model
- `superAdmin`
- `admin`
- `user`

## PassCode auth storage
- Raw passCode is never stored.
- `passCodeHash`: bcrypt hash (verification)
- `passCodeLookup`: sha256(passCode) indexed lookup for login pre-filter

## Seed first superAdmin
Run once before using management APIs.

Required env vars in `node/.env.local` (or `node/.env`):
- `SEED_SUPERADMIN_NAME`
- `SEED_SUPERADMIN_SURNAME`
- `SEED_SUPERADMIN_EMAIL`
- `SEED_SUPERADMIN_PASSCODE` (exactly 6 digits)

Optional:
- `SEED_SUPERADMIN_PAYMENT_OPTION` (`monthly` default)
- `SEED_SUPERADMIN_PAYMENT_AMOUNT` (`0` default)

Run:
```bash
npm run seed:superadmin
```

## Seed initial users
This inserts your current 4 employee users as `role=user`, `paymentOption=hourly`, `isActive=true`.
It skips records if email already exists or passCode is already in use by an active user.

Run:
```bash
npm run seed:users
```

## Manual test commands
Set base URL:
```bash
BASE_URL=http://localhost:3000
```

1. Login (passCode only)
```bash
curl -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"passCode":"123456"}'
```

2. Me (replace `<TOKEN>`)
```bash
curl "$BASE_URL/api/auth/me" \
  -H "Authorization: Bearer <TOKEN>"
```

3. Create admin user (superAdmin token required)
```bash
curl -X POST "$BASE_URL/api/users" \
  -H "Authorization: Bearer <SUPERADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","surname":"User","email":"admin2@example.com","passCode":"222222","role":"admin","paymentOption":"monthly","paymentAmount":3000,"isActive":true}'
```

4. Create normal user (admin token required)
```bash
curl -X POST "$BASE_URL/api/users" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane","surname":"Doe","email":"jane@example.com","passCode":"123456","role":"user","paymentOption":"hourly","paymentAmount":25,"isActive":true}'
```

5. List users (admin or superAdmin token required)
```bash
curl "$BASE_URL/api/users?limit=10&q=john%20smith" \
  -H "Authorization: Bearer <TOKEN>"
```

6. Create project (admin or superAdmin token required)
```bash
curl -X POST "$BASE_URL/api/projects" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"description":"Kitchen remodel","status":"waiting","isActive":true,"quoteNumber":"Q-1022","quoteAmount":8500,"locationKey":"STL-01","address":{"raw":"123 Main St, St Louis, MO","normalized":"123 MAIN ST SAINT LOUIS MO","lat":38.6270,"lng":-90.1994}}'
```

7. List projects with filters
```bash
curl "$BASE_URL/api/projects?limit=20&status=waiting&isActive=true&locationKey=STL-01&q=Kitchen" \
  -H "Authorization: Bearer <TOKEN>"
```

7b. Expense modal project search (project + customer fields)
```bash
curl "$BASE_URL/api/projects/search-for-expenses?limit=10&q=john&status=ongoing" \
  -H "Authorization: Bearer <TOKEN>"
```

7c. Customer dropdown search (project form picker)
```bash
curl "$BASE_URL/api/customers/search-for-project-picker?limit=6&q=john%20smith" \
  -H "Authorization: Bearer <TOKEN>"
```

8. Update project
```bash
curl -X PATCH "$BASE_URL/api/projects/id?id=<PROJECT_ID>" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"status":"ongoing","quoteAmount":9000,"geo":{"lat":38.6270,"lng":-90.1994},"geoRadiusMeters":500,"address":{"normalized":"123 MAIN STREET ST LOUIS MO"}}'
```

9. Soft delete project (superAdmin token required)
```bash
curl -X DELETE "$BASE_URL/api/projects/id?id=<PROJECT_ID>" \
  -H "Authorization: Bearer <SUPERADMIN_TOKEN>"
```

10. Check in (user token required)
```bash
curl -X POST "$BASE_URL/api/time-entries/check-in" \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"projectIdIn":"<PROJECT_ID>","geoIn":{"lat":38.6269,"lng":-90.1996},"addrIn":"Near site entrance","notes":"Starting shift"}'
```

11. Check out (user token required, requires projectIdOut)
```bash
curl -X POST "$BASE_URL/api/time-entries/check-out" \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"projectIdOut":"<PROJECT_ID>","geoOut":{"lat":38.6271,"lng":-90.1995},"addrOut":"Near parking lot","notes":"Shift complete"}'
```

12. List time entries
```bash
curl "$BASE_URL/api/time-entries?limit=20&isOpen=false&projectIdIn=<PROJECT_ID>&from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z" \
  -H "Authorization: Bearer <TOKEN>"
```

13. Admin create historical time entry
```bash
curl -X POST "$BASE_URL/api/time-entries/admin-create" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<USER_ID>","projectIdIn":"<PROJECT_IN_ID>","clockInAt":"2026-02-01T14:00:00.000Z","clockOutAt":"2026-02-01T22:30:00.000Z","projectIdOut":"<PROJECT_OUT_ID>","notes":"Backfilled entry"}'
```

14. Admin patch time entry
```bash
curl -X PATCH "$BASE_URL/api/time-entries/id?id=<TIME_ENTRY_ID>" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"clockOutAt":"2026-02-01T22:45:00.000Z","notes":"Adjusted checkout"}'
```

15. Create bonus or penalty
```bash
curl -X POST "$BASE_URL/api/bonus-and-penalties" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<USER_ID>","amount":-50,"description":"Late arrival penalty","effectiveAt":"2026-02-08T12:00:00.000Z"}'
```

16. List bonus/penalty records
```bash
curl "$BASE_URL/api/bonus-and-penalties?limit=20&userId=<USER_ID>&from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

16b. User list own bonus/penalty records (no userId needed)
```bash
curl "$BASE_URL/api/bonus-and-penalties?limit=20&from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z" \
  -H "Authorization: Bearer <USER_TOKEN>"
```

17. Create payment
```bash
curl -X POST "$BASE_URL/api/payments" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<USER_ID>","amount":450,"paidAt":"2026-02-10T18:00:00.000Z","method":"cash","notes":"Partial salary payout"}'
```

18. List payments
```bash
curl "$BASE_URL/api/payments?limit=20&userId=<USER_ID>&from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z&method=cash" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

18b. User list own payments (no userId needed)
```bash
curl "$BASE_URL/api/payments?limit=20&from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z" \
  -H "Authorization: Bearer <USER_TOKEN>"
```

18c. Create customer payment (project-linked)
```bash
curl -X POST "$BASE_URL/api/customer-payments" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"<PROJECT_ID>","amount":1500,"type":"main_work","paidAt":"2026-02-12T18:00:00.000Z","notes":"Customer partial payment"}'
```

18d. List customer payments (default limit is 10)
```bash
curl "$BASE_URL/api/customer-payments?projectId=<PROJECT_ID>&type=material&from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z&limit=10" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

19. Create project expense
```bash
curl -X POST "$BASE_URL/api/expenses" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"<PROJECT_ID>","type":"material","amount":1200,"spentAt":"2026-02-08T17:00:00.000Z","notes":"Lumber and concrete"}'
```

20. List expenses
```bash
curl "$BASE_URL/api/expenses?limit=20&projectId=<PROJECT_ID>&type=material&from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

21. User summary report
```bash
curl "$BASE_URL/api/reports/user-summary?userId=<USER_ID>&from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

22. Project summary report
```bash
curl "$BASE_URL/api/reports/project-summary?projectId=<PROJECT_ID>&from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

23. My report (user only)
```bash
curl "$BASE_URL/api/reports/me?from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z&limit=30" \
  -H "Authorization: Bearer <USER_TOKEN>"
```

23b. My yearly earnings report (user only)
```bash
curl "$BASE_URL/api/reports/me-earnings?year=2026&limit=30" \
  -H "Authorization: Bearer <USER_TOKEN>"
```

24. Ongoing projects for check-in screen
```bash
curl "$BASE_URL/api/projects/ongoing?limit=50&q=kitchen" \
  -H "Authorization: Bearer <TOKEN>"
```

25. Active projects (admin/superAdmin)
```bash
curl "$BASE_URL/api/projects/active?limit=20&status=waiting&q=stl" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

26. My open entry (user)
```bash
curl "$BASE_URL/api/time-entries/my-open" \
  -H "Authorization: Bearer <USER_TOKEN>"
```

27. My recent entries (user, default last 14 days)
```bash
curl "$BASE_URL/api/time-entries/my-recent?limit=20" \
  -H "Authorization: Bearer <USER_TOKEN>"
```

27b. Hours report (current half-month)
```bash
curl "$BASE_URL/api/time-entries/hours-report?rangePreset=last15&limit=20" \
  -H "Authorization: Bearer <USER_TOKEN>"
```

27c. Hours report (admin user filter + custom range)
```bash
curl "$BASE_URL/api/time-entries/hours-report?rangePreset=custom&from=2026-02-01T00:00:00.000Z&to=2026-02-15T23:59:59.999Z&userId=<USER_ID>&limit=20" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

28. Dashboard today (admin/superAdmin)
```bash
curl "$BASE_URL/api/dashboard/today" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

29. Dashboard open entries (admin/superAdmin)
```bash
curl "$BASE_URL/api/dashboard/open-entries?limit=20&projectIdIn=<PROJECT_ID>" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

30. Project-user labor breakdown (dashboard)
```bash
curl "$BASE_URL/api/reports/project-user-breakdown?from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

30b. Customer payments overview for ongoing projects (paid vs remaining)
```bash
curl "$BASE_URL/api/reports/customer-payments-overview?from=2026-02-01T00:00:00.000Z&to=2026-02-28T23:59:59.999Z" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

31. Create task (admin/superAdmin)
```bash
curl -X POST "$BASE_URL/api/tasks" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Call supplier","description":"Confirm delivery date","dueDate":"2026-02-14T18:00:00.000Z","status":"created","projectId":"<PROJECT_ID>","assignedToUserIds":["<USER_ID>"]}'
```

32. List tasks
```bash
curl "$BASE_URL/api/tasks?limit=20&status=created&projectId=<PROJECT_ID>&q=supplier" \
  -H "Authorization: Bearer <TOKEN>"
```

33. Dashboard my tasks (user)
```bash
curl "$BASE_URL/api/dashboard/my-tasks?limit=20&includeDone=false" \
  -H "Authorization: Bearer <USER_TOKEN>"
```

34. Dashboard today (with task counts)
```bash
curl "$BASE_URL/api/dashboard/today" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```
