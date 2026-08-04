# Savings App Backend

NestJS + TypeORM (PostgreSQL) backend for a savings application with:

- **Auth**: register/login with username, email, password (JWT)
- **Wallet**: simulated balance you fund manually, used to feed savings plans
- **Savings plans**: `REGULAR` and `TARGET` types
- **Autosave**: fixed schedule (daily / weekly / monthly) that automatically
  moves a fixed amount from the wallet into a plan, run by a daily cron job

## 1. Setup

### Option A — Docker (fastest)

```bash
docker compose up --build
```

This starts Postgres and the API together. API is served under
`http://129.121.115.87:3000/api`.

### Option B — Local Node + your own Postgres

```bash
npm install
cp .env.example .env
# edit .env with your PostgreSQL credentials and a real JWT_SECRET
```

> **Note:** if `.env` is missing or `JWT_SECRET` isn't set, the app falls
> back to an insecure development-only secret and logs a warning instead of
> crashing — fine for a quick local run, but set a real `JWT_SECRET` before
> using this beyond your own machine. `npm run start:dev` will also
> auto-create `.env` from `.env.example` for you if it doesn't exist yet.
>
> Similarly, `MAIL_*` variables are optional — leave them blank and
> verification emails are just logged to the console instead of sent.
>
> `PAYSTACK_SECRET_KEY` and `KORAPAY_SECRET_KEY` are different: these touch
> real money and real identity data, so there's no insecure fallback. Leave
> them blank and the app still starts fine — but the Paystack payment
> endpoints and NIN/BVN verification will return `503` until you add real
> keys (see the Payments and Users & Profiles sections below).

Create the database (name must match `DB_NAME` in `.env`):

```bash
createdb savings_app
```

With `DB_SYNCHRONIZE=true` (default in `.env.example`), TypeORM will
auto-create tables on boot — fine for development. For production, set it to
`false` and use migrations instead (`npm run migration:generate` /
`npm run migration:run`).

## 2. Run

```bash
npm run start:dev
```

API is served under `http://129.121.115.87:3000/api`.

## 2b. Smoke test

Once the server is running (either via Docker or `npm run start:dev`), you
can exercise the full flow — register, fund wallet, create a plan with
autosave, deposit, check balances — with:

```bash
./scripts/smoke-test.sh
# or against a different host:
./scripts/smoke-test.sh http://129.121.115.87:3000/api
```

## 2c. Testing email verification

There are three ways to test the email flow, depending on how deep you want to go:

**1. Automated unit tests** — cover the logic without sending anything:

```bash
npm test
```

This runs `mail.service.spec.ts` (SMTP-configured vs. console-fallback
paths, plus delivery-failure handling) and `auth.service.spec.ts`
(registration issues a token, login is blocked until verified, token
verification/expiry, resend behavior).

**2. Visual inbox with MailHog** — see the real email render in a browser:

```bash
docker compose up --build
```

`docker-compose.yml` already points the API at a bundled MailHog container.
Register a user, then open **http://129.121.115.87:8025** — the verification
email (with a clickable link) will be sitting in the inbox. This is the
closest thing to testing what a real user would see.

If you're running the API locally instead of via Docker, you can still use
MailHog standalone: `docker compose up mailhog`, then set `MAIL_HOST=localhost`
and `MAIL_PORT=1025` in your `.env`.

**3. Fast manual loop without any mail setup** — outside `NODE_ENV=production`,
`register`'s response includes a `devVerificationToken` field, so you can
copy it straight into `verify-email` without checking an inbox at all (this
is what `scripts/smoke-test.sh` does). With real `MAIL_HOST` credentials
configured, this field is still present in dev — the email is sent *and*
the token is echoed back, so you can cross-check both paths agree.

## 3. API Reference

All endpoints except `/auth/*` require `Authorization: Bearer <accessToken>`.

### Auth

| Method | Route            | Body                                     |
|--------|-------------------|-------------------------------------------|
| POST   | `/api/auth/register` | `{ username, email, password }`        |
| POST   | `/api/auth/login`    | `{ identifier, password }` (identifier = username or email) |
| GET    | `/api/auth/verify-email?token=...` | – (for clicking the link in the email) |
| POST   | `/api/auth/verify-email` | `{ token }` (form/API alternative to the GET link) |
| POST   | `/api/auth/resend-verification` | `{ email }` |

**Email verification is required before login.** After `register`, the user
is created but `isEmailVerified` is `false`; a verification link valid for
24 hours is emailed to them. `login` returns `403 Forbidden` until the email
is confirmed via `verify-email`. `resend-verification` issues a fresh token
if the old one expired (it always returns a generic success message,
regardless of whether the email exists, to avoid leaking which emails are
registered).

By default (no `MAIL_HOST` set), emails aren't actually sent — the
verification link is logged to the console instead, so you can copy it out
during local development. Set `MAIL_HOST`/`MAIL_PORT`/`MAIL_USER`/`MAIL_PASS`
in `.env` to send real emails via SMTP.

For convenience, outside of `NODE_ENV=production` the `register` response
also includes a `devVerificationToken` field with the raw token, so you can
call `verify-email` immediately without digging through logs or an inbox.
This field is never included in production.

`login` returns `{ accessToken, user }` on success.

### Users & Profiles

Every user has a `role` (`USER` or `ADMIN`, default `USER`) and a separate
`profile` (name, phone, date of birth, address, avatar) created automatically
at registration. Admin-only routes are marked below.

| Method | Route                    | Body | Description | Access |
|--------|--------------------------|------|--------------|--------|
| GET    | `/api/users/me`          | –    | Your own user + profile | Any authenticated user |
| PATCH  | `/api/users/me/profile`  | see below | Update your own profile | Any authenticated user |
| GET    | `/api/users`             | –    | List all users + profiles (paginated) | **Admin only** |
| GET    | `/api/users/:id`         | –    | Get any user + profile by id | **Admin only** |
| PATCH  | `/api/users/:id/role`    | `{ "role": "ADMIN" }` | Change a user's role | **Admin only** |

**Update your profile** — `PATCH /api/users/me/profile` (all fields optional):
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "phoneNumber": "+2348012345678",
  "dateOfBirth": "1995-04-12",
  "address": "12 Marina Road, Lagos",
  "avatarUrl": "https://example.com/avatar.jpg",
  "nin": "12345678901",
  "bvn": "22222222222"
}
```

**NIN & BVN verification** — `nin` and `bvn` must each be exactly 11 digits.
Submitting either one triggers a real-time check against the government
database via [Korapay's identity verification API](https://developers.korapay.com/docs/nigeria-nin)
*before* it's saved:
- If Korapay confirms the number is genuine, it's stored and
  `ninVerified`/`bvnVerified` flips to `true`.
- If verification fails (invalid number, provider says no match), the whole
  `PATCH` request is rejected with `400 Bad Request` and nothing is saved —
  you can't end up with an unverified NIN/BVN sitting in the profile.
- If your profile already has `firstName`/`lastName` set, they're sent
  along for name-matching; a mismatch also fails the request.
- Re-submitting the same, already-verified number is a no-op (no repeat API
  call/charge) — only a *changed* value triggers re-verification.
- The raw `nin`/`bvn` are never returned by the API. Responses instead
  include `maskedNin`/`maskedBvn` (e.g. `"*******8901"`) plus the
  `ninVerified`/`bvnVerified` booleans.
- Requires `KORAPAY_SECRET_KEY` in `.env` — without it, submitting `nin` or
  `bvn` returns `503 Service Unavailable` rather than silently skipping
  verification. Get test keys from your Korapay dashboard.

**List users (admin)** — `GET /api/users?page=1&limit=20` — returns
`{ data, total, page, limit }`.

**Change a role (admin)** — `PATCH /api/users/:id/role` with
`{ "role": "ADMIN" }` or `{ "role": "USER" }`. An admin cannot change their
own role (to avoid accidentally locking themselves out) — have another admin
do it, or use the CLI script below.

**Bootstrapping your first admin** — there's intentionally no public
endpoint that turns a regular user into an admin. After registering and
verifying a user normally, promote them from the command line:

```bash
npm run promote:admin -- someone@example.com
```

### Wallet

| Method | Route                   | Body               | Description               |
|--------|-------------------------|---------------------|----------------------------|
| GET    | `/api/wallet/balance`   | –                   | Current wallet balance     |
| POST   | `/api/wallet/fund`      | `{ amount }`        | Simulate a wallet deposit (no real money moves — useful for dev/testing) |
| GET    | `/api/wallet/transactions` | –                | Wallet transaction history |

### Payments (Paystack — real wallet funding)

`POST /api/wallet/fund` above is a simulated deposit. To fund the wallet with
real money via [Paystack](https://paystack.com), use this flow instead:

| Method | Route                                      | Body / Params | Access |
|--------|---------------------------------------------|----------------|--------|
| POST   | `/api/wallet/fund/paystack/initialize`       | `{ "amount": 5000, "callbackUrl": "https://..." }` (`callbackUrl` optional) | Authenticated |
| GET    | `/api/wallet/fund/paystack/verify/:reference`| –              | Authenticated (must own the payment) |
| POST   | `/api/webhooks/paystack`                     | Paystack webhook payload | Public (HMAC-signature verified — not for browser/client use) |

**How it works:**
1. Client calls `initialize` with an amount (in NGN). The response includes
   an `authorizationUrl` — redirect the user there (or open it in Paystack's
   Popup JS) to complete payment, and a `reference` to track it.
2. A `PaymentTransaction` row is created as `PENDING` immediately, before the
   user even pays — so both confirmation paths below have something to update.
3. **Either** the client calls `GET .../verify/:reference` after payment (using
   the reference from the redirect/callback), **or** Paystack calls
   `POST /api/webhooks/paystack` automatically once the charge succeeds —
   whichever arrives first credits the wallet. Both paths are idempotent
   (safe to be called more than once, or both), and the amount actually
   paid is checked against what was requested before crediting anything.
4. On success, the wallet is credited via the same `WalletService.fund()`
   used by the simulated endpoint, so it shows up identically in
   `GET /api/wallet/transactions`.

**Configuration** — requires `PAYSTACK_SECRET_KEY` in `.env` (test keys from
your [Paystack dashboard](https://dashboard.paystack.com) → Settings → API
Keys); without it, `initialize`/`verify` return `503 Service Unavailable`.

**Webhook setup** — in the Paystack dashboard, set the webhook URL to
`https://<your-domain>/api/webhooks/paystack`. Paystack can't reach
`localhost`, so for local testing use a tunnel (e.g. `ngrok http 3000`) and
point the dashboard at the tunnel's HTTPS URL. The webhook verifies Paystack's
`x-paystack-signature` header (HMAC-SHA512 over the raw body) before trusting
any event — this is why `main.ts` enables `rawBody: true`.

### Savings Plans

| Method | Route                          | Body / Notes |
|--------|---------------------------------|---------------|
| POST   | `/api/savings`                  | See below |
| GET    | `/api/savings`                  | List your plans |
| GET    | `/api/savings/:id`               | Plan detail |
| GET    | `/api/savings/:id/transactions`  | Plan transaction history |
| POST   | `/api/savings/:id/deposit`       | `{ amount }` — manual top-up from wallet |
| POST   | `/api/savings/:id/withdraw`      | `{ amount }` — moves money back to wallet |
| PATCH  | `/api/savings/:id/autosave`      | Enable/disable or reconfigure autosave |
| DELETE | `/api/savings/:id`               | Close plan (balance must be 0) |

**Create a plan** — `POST /api/savings`

Autosave works the same way on both `REGULAR` and `TARGET` plans — it's a
property of the plan, not tied to its type.

```jsonc
// Regular savings, no autosave
{ "name": "Emergency Fund", "type": "REGULAR" }

// Regular savings WITH autosave
{
  "name": "Emergency Fund",
  "type": "REGULAR",
  "autosaveEnabled": true,
  "autosaveFrequency": "DAILY",      // DAILY | WEEKLY | MONTHLY
  "autosaveAmount": 2000,
  "initialDeposit": 10000             // optional, funded from wallet immediately
}

// Target savings with autosave
{
  "name": "New Laptop",
  "type": "TARGET",
  "targetAmount": 500000,
  "targetDate": "2026-12-31",       // optional
  "autosaveEnabled": true,
  "autosaveFrequency": "WEEKLY",     // DAILY | WEEKLY | MONTHLY
  "autosaveAmount": 10000,
  "initialDeposit": 20000            // optional, funded from wallet immediately
}
```

**Update autosave** — `PATCH /api/savings/:id/autosave` (also works on
`REGULAR` plans)

```jsonc
// Enable / change schedule
{ "autosaveEnabled": true, "autosaveFrequency": "MONTHLY", "autosaveAmount": 25000 }

// Disable
{ "autosaveEnabled": false }
```

### Admin Dashboard

Every route below requires `Authorization: Bearer <token>` for a user with
`role: "ADMIN"` (see [Bootstrapping your first admin](#users--profiles)
above). All list endpoints share the same pagination shape:
`{ data, total, page, limit }`, and accept `?page=&limit=` (default 1/20).

| Method | Route | Body / Query | Description |
|--------|-------|---------------|--------------|
| GET    | `/api/admin/users`                | `?page=&limit=` | List all users + profiles |
| POST   | `/api/admin/users`                | `{ username, email, password, role? }` | **Create a user directly** — pre-verified, skips the email-confirmation flow, optional role |
| GET    | `/api/admin/users/:id`             | –                | Any single user + profile |
| PATCH  | `/api/admin/users/:id/role`        | `{ "role": "ADMIN" }` | Change a user's role |
| GET    | `/api/admin/transactions`          | `?page=&limit=&userId=` | Every **wallet transaction** across every user |
| GET    | `/api/admin/payments`              | `?page=&limit=&userId=&status=` | Every **Paystack payment transaction** (the payment gateway's transaction log — separate from wallet transactions) |
| GET    | `/api/admin/activity-log`          | `?page=&limit=&userId=&action=` | Full audit trail: registrations, logins, profile edits, KYC attempts, role changes, wallet/payment events, and more |
| GET    | `/api/admin/reports`               | –                | Aggregate platform summary (see below) |
| GET    | `/api/admin/settings`              | –                | Current values of all known settings (with defaults for anything never explicitly set) |
| PUT    | `/api/admin/settings/:key`         | `{ "value": "true" }` | Update a setting by key |

**Create a user (admin)** — `POST /api/admin/users`. Unlike self-registration,
this skips email verification entirely (an admin is vouching for the
account) and can assign a role up front:
```json
{ "username": "support_agent", "email": "agent@company.com", "password": "TempPass123", "role": "ADMIN" }
```

**Report** — `GET /api/admin/reports` returns a combined snapshot:
```jsonc
{
  "generatedAt": "2026-08-02T10:00:00.000Z",
  "users": { "totalUsers": 42, "totalAdmins": 2, "totalVerifiedEmails": 39, "totalWalletBalance": "1250000.00" },
  "savings": { "totalPlans": 58, "activeAutosavePlans": 21, "completedTargetPlans": 6, "totalSavingsBalance": "890000.00" },
  "payments": { "totalSuccessfulPayments": 30, "totalSuccessfulVolume": "610000.00", "totalPendingPayments": 2, "totalFailedPayments": 1 }
}
```

**Settings** — currently one setting drives real behavior:
`requireKycForWithdrawal` (`"true"`/`"false"`, default `"false"`). When
`"true"`, `SavingsService.withdraw()` rejects withdrawals from any user
without a verified BVN (`403 Forbidden`). New settings can be added to
`src/settings/setting-keys.ts` without a migration — the store is a generic
key/value table.
```bash
# Turn on KYC-gated withdrawals
curl -X PUT /api/admin/settings/requireKycForWithdrawal \
  -H "Authorization: Bearer <admin token>" -H 'Content-Type: application/json' \
  -d '{"value": "true"}'
```

**Activity log** — every significant action writes an entry
(`action`, `userId`, `metadata`, `createdAt`) via `ActivityLogService`,
including `USER_REGISTERED`, `USER_LOGIN`, `EMAIL_VERIFIED`,
`PROFILE_UPDATED`, `NIN_VERIFIED`/`NIN_VERIFICATION_FAILED`,
`BVN_VERIFIED`/`BVN_VERIFICATION_FAILED`, `USER_ROLE_CHANGED`,
`ADMIN_CREATED_USER`, and `WALLET_*` events. Logging failures never break
the operation they describe (errors are caught and logged, not thrown).

## 4. How autosave works

- Autosave is a property of the **plan**, not the plan type — `REGULAR` and
  `TARGET` plans both support it identically. The only difference is that a
  `TARGET` plan auto-completes (and autosave switches off) once its balance
  reaches `targetAmount`; a `REGULAR` plan just keeps accumulating with no
  end condition.
- Each plan with autosave enabled stores `autosaveFrequency`, `autosaveAmount`,
  and `nextAutosaveDate`.
- A cron job (`AutosaveScheduler`, `@nestjs/schedule`) runs once a day at
  midnight, finds every active plan whose `nextAutosaveDate` has arrived,
  debits the owner's wallet, credits the plan, and reschedules
  `nextAutosaveDate` based on the frequency.
- If the wallet balance is insufficient at the time autosave runs, that
  cycle is skipped (logged) and the schedule still advances so it retries
  next cycle rather than looping on the same day.
- When a `TARGET` plan's balance reaches its `targetAmount`, the plan is
  marked `COMPLETED` and autosave is automatically turned off.

## 5. Project structure

```
src/
  auth/        # register/login, JWT strategy & guard, email verification
  mail/        # email sending (SMTP or console-log fallback in dev)
  users/       # User + Profile entities, roles, admin user management
  identity/    # Korapay NIN/BVN verification
  wallet/      # simulated wallet balance + transaction history
  payments/    # Paystack integration: initialize/verify/webhook, real wallet funding
  savings/     # savings plans, deposits/withdrawals, autosave logic + cron
  activity-log/ # audit trail (fire-and-forget, admin-readable)
  settings/    # generic key/value app settings (e.g. requireKycForWithdrawal)
  admin/       # admin dashboard: users, transactions, payments, activity log, reports, settings
  common/      # shared enums, @Roles() decorator, RolesGuard
  config/      # TypeORM data source config
  app.module.ts
  main.ts
scripts/
  smoke-test.sh          # end-to-end curl walkthrough
  promote-to-admin.ts    # bootstrap the first ADMIN user
```
