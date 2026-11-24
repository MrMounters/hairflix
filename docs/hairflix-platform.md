# Hairflix shared app: implementation and rollout

The native Expo app now uses `/api/platform/*` for authenticated shared data. The public marketing site and Squire links are unchanged. The older `dist/app` browser prototype is separate and still uses its original local preview storage; it has **not** been migrated to this API. The new native app is also exported to `/portal/` by `npm run build` for Vercel. The existing invitation gateway protects this browser route, followed by the app’s own sign-in. A link from the original workspace selector opens it; the footer gateway remains unchanged.

## Implemented and persisted

| Area | Working behavior |
|---|---|
| Identity | Customer registration; initial owner activation with a private server token; single-use, email-bound staff invitations; hashed passwords and session tokens; expiring/revocable sessions; native SecureStore credentials |
| Permissions | Server-enforced owner, assigned barber and customer permissions; location assignments; owner-controlled prices, contact visibility and working-hour edits |
| Settings | Shop/location/barber scope; revision conflicts prevent silent overwrite; typed validation; audit history; business details, booking/cancellation windows, hours, chair terms, notifications and retention |
| Catalog | Each barber’s services, icons, prices, durations, categories and archive state; booked service snapshots preserve existing prices |
| Calendar | Two-location agenda; appointments and walk-ins; server interval conflict checks, buffers, hours and time off; manual date/time entry; vacation ranges and absence/reassignment workflows |
| Conversations | Shared customer/barber and shop threads; per-user unread/read state; booking and rescheduling from the conversation; immutable appointment event cards |
| Tickets | Start, edit services, request approval, customer tip and approval; explicit in-person approval recording for customers without accounts; cancellation, rescheduling and no-shows |
| Cash and earnings | Explicit staff-confirmed cash receipt; idempotent payment recording; separate tax, tips and service split; tips stay with the performing barber; reports by date/location |
| Chair rent | Daily/weekly/monthly terms, collection day, manual due-date invoice creation and confirmed cash settlement; no automatic bank debit |
| Photos | Barber profile and portfolio uploads; private customer haircut photos/notes; explicit sharing; consent before moderated publication; revocation and deletion |
| Customers | Staff-created records; CSV file upload/JSON paste (up to 5,000 contacts), Squire header mapping, import preview and validation report; normalized phone/email duplicate skipping; owner CSV download/share; explicit merge of imported records |
| Growth | Campaign drafts and explicit send confirmation; selected-channel opt-in filtering; worker-generated overdue/winback reminders; no fabricated delivery |
| Loyalty | Paid-visit stamps and shop-funded credit; reserve against an in-progress ticket, show credit before customer approval, redeem only on payment; protect performing barber’s original commission |
| Notifications | Durable recipient-specific inbox and unread status; push token registration; outbox; worker leases, blocked/accepted/failed/uncertain statuses; Expo receipt polling |

Settings inherit organization → location → barber. An override is a full group snapshot, so an existing override does not automatically inherit later organization changes. Personal notification preferences are scoped to `user/<id>`; other people’s preferences cannot be edited. Time is Arizona (`America/Phoenix`), including cancellation boundaries. Initial location details/hours mirror the existing website; the owner must verify these before a live cutover.

## Run locally

Use Node 24 and npm. From repository root:

```sh
npm ci
```

Copy `.env.example` to `.env.local`. Configure a persistent local SQLite path with `APP_DATABASE_FILE=./hairflix-app.sqlite`, set a newly generated private `APP_BOOTSTRAP_TOKEN` of at least 32 random characters, and use `APP_MODE=pilot`. Then:

```sh
npm run dev
```

From `mobile/`, copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_APP_API_URL` to the HTTPS server URL. A physical phone cannot reach the computer through `localhost`; use a reachable development server URL. `EXPO_PUBLIC_*` values are bundled into the client: **never place secrets there**.

```sh
npm ci
npm start
```

Choose **Activate owner**, create the first owner account with the private activation code, then remove/rotate the activation secret. In Team & invitations, create barber invitations and share each code privately with its named recipient. Customers register without an invitation. Configure services, hours, booking policy and chair agreements. Do not put live customers into the pilot calendar.

## Vercel/server storage

Use `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for durable Vercel storage. Do not use an ephemeral function filesystem as a production SQLite database. SQLite is supported for persistent Node hosts and local testing.

The records repository uses atomic compare-and-swap transactions: concurrent booking, payment, message and settings changes retry against the latest records. Requests carry per-user idempotency IDs. Record edits and financial operations are audited. Sessions last seven days; logging out invalidates that token and disables push destinations registered by that session.

This initial repository reads a full versioned record snapshot. It is suitable for a bounded internal pilot, not an unbounded multi-tenant SaaS. Photos are resized and converted to JPEG on upload, limited to 375 KB compressed and 30 per uploader. Before a broad launch, move media to private object storage, use indexed/partitioned records with bounded queries and retention, and configure backups/restoration and monitoring. Keep the database and tokens server-only.

`/api/platform/*` bypasses the old site invitation cookie because native clients use their own bearer sessions. Except for config, preflight and account creation/sign-in, platform endpoints require authentication. Worker access has its own independent secret. Allowed browser origins must be listed in `PUBLIC_ORIGIN` or `APP_WEB_ORIGINS`; native clients do not supply a browser origin.

## Notifications and delivery

In-app notifications work with durable storage alone. For external delivery:

- Push: link the Expo app to its EAS project, configure Apple/Android push credentials, install a physical-device build and enable notifications in Updates. Set `APP_EXPO_ACCESS_TOKEN` if Expo push access-token protection is enabled.
- Email: set `APP_EMAIL_API_KEY` to a Resend API key and `APP_EMAIL_FROM` to a verified sender.
- SMS: set `APP_SMS_ACCOUNT_ID`, `APP_SMS_AUTH_TOKEN`, and `APP_SMS_FROM` for Twilio. Finish the sender’s registration/consent and opt-out processing before enabling live promotional texts.
- Set a random `APP_WORKER_SECRET` of at least 32 characters. Schedule an authenticated **POST** to `/api/platform/worker` every minute using an external scheduler. Authorization: `Bearer <APP_WORKER_SECRET>`. No scheduler is provisioned by this commit. An owner can also manually run the worker from Connections.

The worker processes at most 20 jobs per call. It rechecks current preferences/marketing consent, blocks missing providers/destinations and leases each send. Uncertain outcomes require review rather than automatic duplicate texts. Provider acceptance is not labeled delivery. Expo receipts are checked after 15 minutes and describe APNs/FCM handoff, not user receipt. Email/SMS delivery callbacks, bounce/STOP handling and operator retry controls still need implementation before a public messaging launch. Provider requests use injected adapters in tests; actual provider delivery was not exercised here.

Retention reminders run when the worker runs, honor shop quiet hours, avoid duplicate stages, skip customers with upcoming bookings and enforce minimum marketing spacing. Promotions target account-linked opted-in customers, not imported records with assumed consent. Automatic percentage discount coupons are unsupported; use zero winback percent. Campaign credits are not automatically invented.

## Booking and payment cutover

`APP_MODE=pilot` permits explicitly marked internal test bookings. With neither pilot mode nor `APP_LIVE_BOOKING=true`, creation fails closed. `booking.enabled` also controls customer self-booking. Prepayment remains unavailable and fails before confirming a booking.

Only set `APP_LIVE_BOOKING=true` after resolving the authoritative calendar and cutover with the shop. There is no Squire/Booksy synchronization, data scraping or verified partner API connection. An internal booking must not create a second competing live calendar.

Card/Apple Pay/Google Pay/Cash App processing, refunds, deposit forfeiture, payout transfers, Wallet passes, Tap to Pay, memberships, gift cards, WhatsApp and Instagram integrations are **not implemented in this API**. Their availability indicators remain off. Saved method/deposit preferences do not collect money. Existing sandbox Connect/legacy booking APIs are separate; their payment events do not settle these new platform tickets.

Shop-funded rewards are credits against service value, not tax-reducing coupons: tax remains on the full service amount, tips stay separate and the shop absorbs the credit. Confirm this treatment with the shop’s accounting configuration before live use. A credit can exceed that visit’s shop share, so the shop share may become negative. Rent invoices require manual creation/settlement; terms do not authorize automatic collection.

## Remaining release work

This is a functional internal pilot, **not a claim of complete Squire/Booksy parity or TestFlight approval**. Before public rollout:

1. Configure durable hosted storage, HTTPS origins, bootstrap the real owner and replace pilot accounts with real invitations.
2. Add password recovery and email/phone verification. Existing registration does not prove ownership of those contact destinations. Add staff MFA before sensitive live financial permissions.
3. Resolve Squire cutover or obtain supported API access; perform a reconciliation/import rehearsal and verify schedules, menus, tax and policies with the owner.
4. Implement the chosen live payment provider and signed payment/refund events before enabling online prepayment or wallet payment methods.
5. Finish external notification delivery callbacks, SMS opt-out synchronization, production scheduling and device delivery tests.
6. Verify native photo permissions, push/deep links, keyboard behavior and accessibility on iPhone/iPad/Android. Browser checks and Metro exports do not replace hardware tests.
7. Set the final Apple-owned bundle identifier (currently provisional `com.hairflix.preview`), link the owner’s EAS project and App Store Connect app, complete privacy/support disclosures and review accounts, then build and submit a signed iOS binary.

Waitlist, recurring appointment series, drag-selection calendar interaction, inventory/retail checkout, bank reconciliation, chargeback/refund administration, membership billing, gift-card liabilities and advanced payroll are not shipped. The shipped calendar uses an agenda and validated date/time forms. The former local preview modules remain for reference/tests but are no longer the native app entry point.

## Verification

```sh
npm test
npm --prefix mobile run typecheck
npm --prefix mobile test
cd mobile
npx expo export --platform all
```

Integration tests cover authorization, scoped revisions, atomic booking conflicts, service snapshots, absence/reassignment and performing-barber compensation, per-user unread state, appointment cards, private media/notes, approval/cash boundaries, financial idempotency, marketing preferences, import validation, persistent SQLite records, schedule locks and shop-funded reward accounting. UI checks exercise owner activation, saving/reopening settings, staff invitations and widths 320–768px.

## Owner contact transfers

Open **Settings → Customers → Import contacts from CSV file**. Select a Squire customer report or standard Name/Email/Phone CSV, review the first rows, then confirm. Imports preserve notes and last-visit/source metadata as history, not new paid appointments. Existing matching contacts are skipped; opt-out suppressions are retained conservatively, including on matches. Imported contacts are not automatically subscribed to marketing.

**Export contacts as CSV** downloads a file in the browser or opens the native share/save sheet on iPhone/Android. Export includes the source history and opt-out flags; spreadsheet formula prefixes are escaped. Transfers require owner access. Search limits the rendered list to 50 matches, with merge choices limited to 20 search matches. File limit: 750 KB, up to 5,000 rows, within the API request size limit.

The supplied report was tested only in an isolated in-memory database. The private CSV is not committed or bundled, and it has not been imported into a live database.
