# Stripe Connect sandbox setup

Hairflix is the first merchant using the SaaS. The SaaS platform's Stripe account owns the Connect integration; Hairflix and independent barbers onboard as connected merchants. A separate standalone Hairflix Stripe account does not, by itself, mean that it is connected to the platform.

## What this change delivers

- Owner Account → Payments & payouts, and Barber Account → Payments & payouts.
- Dedicated sandbox staff sign-in, independent of the public prototype workspace selector.
- Accounts v2 merchant creation; full Stripe Dashboard access; Stripe collects processing fees and owns connected-account negative-balance liability; direct-charge configuration.
- Stripe embedded onboarding, notification banner, account settings, payments and payouts. Standard and instant payouts are requested as embedded features; Stripe enforces eligibility, destination, balance and fees.
- Server-owned user/account mapping. Browser-supplied account IDs cannot select another merchant.
- Live balance/status reads every 20 seconds while the panel is visible; signed connected-account webhook verification.
- Test-key guard: this module refuses live API keys and live webhook events. No real payouts can be made.

This prepares merchant onboarding and payout management. The `/app/` appointment/ticket data remains browser-local; this change does not sync that data to Stripe, charge final tickets, settle commission splits, or turn customer approval into verified payment. The older marketing-site $5 deposit checkout remains a separate integration using `STRIPE_API_KEY`; leave the existing `BOOKING_ENABLED` setting unchanged while testing Connect. Do not use its webhook as the Connect endpoint.

## 1. Stripe platform sandbox

1. In the SaaS platform Stripe account, create/select a dedicated **Sandbox**. Do not use the standalone Hairflix merchant account's keys for platform API calls.
2. Enable Connect with **Merchants collect payments directly**. Each shop/independent merchant has its own customer payment relationship. Full Dashboard + Stripe-owned processing pricing is the starting configuration.
3. Open the sandbox API keys page. Prefer a restricted server key (`rk_test_`) with the permissions below. Use a sandbox secret key (`sk_test_`) only if your sandbox's restricted-key controls do not expose a required Accounts v2 permission; narrow it before wider testing.
4. Copy the **platform sandbox** publishable key (`pk_test_`) and server key into Vercel, not into chat, JS files or git.
5. Configure Connect branding and embedded components for the sandbox. Keep Stripe user authentication enabled. The embedded component can require its own Stripe login before showing financial information.

### Key permissions

The server needs Accounts v2 read/write, Account Sessions write, Accounts v1 read (compatibility status read), Balance read, and Payouts read on connected accounts. Embedded components delegate their configured operations through scoped Account Sessions. No platform transfers or payouts-create endpoint is exposed by our server. If Stripe's key editor names these permissions differently, verify each operation in the sandbox and use its permission-error message to identify the missing permission.

## 2. Durable sandbox storage

Connect a dedicated sandbox Upstash Redis REST database to the Vercel project. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as secrets. This persists connected account IDs, rate limits and webhook receipts across serverless invocations. It never stores bank details, card details or plaintext passwords.

Local in-memory booking SQLite is not the Connect account registry. Connect requires Redis locally as well. Use separate databases and session secrets for isolated environments.

## 3. Vercel settings

Project: `hairflix`, team `mrmounters-projects`.

| Variable | Value | Type |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | `https://hairflix.vercel.app` for testing on this domain | Config |
| `CONNECT_ENABLED` | `true` | Config |
| `CONNECT_MODE` | `sandbox` | Config |
| `STRIPE_CONNECT_API_KEY` | Platform sandbox `rk_test_…` (or sandbox `sk_test_…`) | Secret |
| `STRIPE_CONNECT_PUBLISHABLE_KEY` | Matching platform sandbox `pk_test_…` | Config |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret for the Connect webhook below | Secret |
| `CONNECT_SESSION_SECRET` | 32+ cryptographically random characters | Secret |
| `CONNECT_SANDBOX_USERS_JSON` | JSON user mapping below | Secret |
| `UPSTASH_REDIS_REST_URL` | Sandbox database REST URL | Secret |
| `UPSTASH_REDIS_REST_TOKEN` | Sandbox database REST token | Secret |
| `BOOKING_ENABLED` | Leave unchanged; controls the separate legacy booking flow | Existing config |

Vercel's **Production** environment means the published deployment, not Stripe live mode. It is safe to use sandbox keys on the public app while testing because this Connect module rejects live keys. For a Preview deployment, set `PUBLIC_ORIGIN` to that preview's exact origin and use separate sandbox storage/keys. Never use an arbitrary incoming Host header as the trusted origin. Changes require redeployment.

Do not overwrite existing variables blindly. `/api/connect/config` exposes readiness and missing VARIABLE NAMES only, never secrets. Webhook readiness is reported separately so onboarding can be tested before webhook delivery is configured.

### Local development

Copy `.env.example` to the gitignored `.env.local`, populate the same sandbox settings and use `PUBLIC_ORIGIN=http://127.0.0.1:8092` locally. Use a separate local Redis database/session secret if you need isolation. Run `npm run dev` and open `http://127.0.0.1:8092/app/?role=owner`. This project uses Node 24; the dev command loads `.env.local` automatically. Do not commit the local file.

## 4. Sandbox staff sign-in

Create unique passwords in a password manager. Save one temporarily in a local file outside the repository with permissions `600`, then run:

```bash
node scripts/connect-user.mjs owner hairflix-owner owner "Hairflix Owner" YOUR_EMAIL < /private/path/owner-password.txt
node scripts/connect-user.mjs lara hairflix-lara barber "Lara" LARA_TEST_EMAIL < /private/path/lara-password.txt
```

Each prints a JSON object containing a salted scrypt password hash. Merge the objects into one object and paste it into the Secret `CONNECT_SANDBOX_USERS_JSON`. Delete the temporary password files. Use the original username/password to sign into the app's payout panel. Do not commit the mapping or real email addresses.

Shape (placeholders are not valid credentials):

```json
{
  "owner": {"id":"hairflix-owner","role":"owner","displayName":"Hairflix Owner","email":"YOUR_EMAIL","passwordHash":"scrypt:SALT:HASH"},
  "lara": {"id":"hairflix-lara","role":"barber","displayName":"Lara","email":"LARA_TEST_EMAIL","passwordHash":"scrypt:SALT:HASH"}
}
```

If you already created a Hairflix **connected account inside this same platform sandbox**, append its `acct_…` ID as the last helper argument. This sets its `accountId` in the server-owned mapping. Do not enter a platform's own account ID, a live account ID, or an account belonging to a different platform/sandbox. Do not create a second account for Hairflix if the correct sandbox-connected one already exists.

Otherwise omit `accountId`, sign in and select **Set up sandbox account**. Account creation is idempotent for each principal. Save the returned `acct_…` in your records; Redis retains it. Never change a principal ID to reset onboarding casually, since that creates a different account. Changing a password hash invalidates that principal's existing app sessions. Sandbox sign-in expires after eight hours.

This isolated sandbox password mechanism is not customer/staff production authentication. Before live operation, integrate the real identity provider, shop membership authorization, MFA/account recovery and audited owner permissions. Connect remains sandbox-only in code until that work is explicitly implemented.

## 5. Connected-account webhook

In the PLATFORM sandbox, create an event destination for **Connected accounts**:

`https://hairflix.vercel.app/api/connect/webhook`

Choose snapshot events with a signing secret. Subscribe to:

- `account.updated`, `account.application.deauthorized`
- `balance.available`
- `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`, `payout.canceled`

Save this destination's `whsec_…` as `STRIPE_CONNECT_WEBHOOK_SECRET`. This endpoint verifies the raw request bytes and rejects live events. It records deduplicated event receipts; financial status is always read from Stripe on the authenticated account. It does not confirm local appointment tickets.

Accounts v2 thin-event destinations use a different event format and are not handled here. Accounts v1 compatibility reads provide current charges/payouts readiness for the v2-created accounts. Do not send thin events to this snapshot endpoint.

## 6. Verify in sandbox

1. Redeploy. `/api/connect/config` should show `ready:true` and, after webhook setup, `webhookConfigured:true`.
2. Open `/app/?role=owner`, Account → Payments & payouts. Sign in as owner, then create/map the Hairflix sandbox merchant and complete Stripe test onboarding.
3. Open `/app/?role=barber`, Account → Payments & payouts. Sign out of the owner session, sign in as Lara, and onboard only if she operates as an independent merchant. Do not invent real identity details; use Stripe's documented sandbox test data.
4. Confirm Settings can collect a payout destination; review requirements in Onboarding. Confirm the account's balances match the Stripe sandbox Dashboard.
5. Create a test payment for that **connected account**, not the platform balance, using Stripe's documented Connect testing flow. A platform-only test charge will not fund the merchant balance.
6. In Payouts, test a standard payout and, when Stripe exposes it as eligible, an instant payout. Review the fee before confirming. Test funds and instant-payout eligibility are Stripe-controlled; a connected account does not automatically qualify for Instant Payouts in live mode.
7. Verify webhook deliveries get HTTP 200. Test a failed payout and inspect Stripe's next steps. Check that switching the public workspace or submitting another account ID cannot change financial access.
8. Sign out: both the app cookie and embedded Stripe session are cleared.

## Payment economics and next integration

The intended application fee is 25 basis points (0.25%), additional to Stripe processing fees. A $100 charge would retain a $0.25 application fee, before any other platform costs. The shop bears Stripe processing fees with this configuration. Do not claim this fee is already being charged: final-ticket checkout is not connected yet.

Next payment work must create direct Checkout Sessions in the authenticated merchant's Stripe account with an integer-cent `application_fee_amount`, persist the final approved ticket and tip server-side, verify signed connected-account checkout events matching account/session/amount/currency/revision, and stream/poll that server status into the customer/barber confirmation screens. A redirect or local approval is never payment proof.

Owner commission payouts, chair rent and shop-to-barber splits require an explicit account/funds-flow decision. An independent barber's direct payments produce their own Stripe balance; that balance can be paid out. A barber cannot withdraw the owner's shop balance through this panel.

References: https://docs.stripe.com/connect/accounts-v2, https://docs.stripe.com/connect/get-started-connect-embedded-components?platform=web, https://docs.stripe.com/connect/instant-payouts, https://docs.stripe.com/connect/testing.
