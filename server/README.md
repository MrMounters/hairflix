# Booking operations

The application serves the marketing site and a new booking flow in one Vercel deployment. It does not synchronize with SQUIRE. Keep online booking disabled until the shop has allocated capacity to this calendar and established a process to prevent conflicts with walk-ins and other schedulers.

## Local development

Use Node 24, run `npm install` and `npm run dev`, then open http://127.0.0.1:8092. Run `node tests/booking.test.mjs` for the ten backend checks. The SQLite adapter is for local verification; Vercel uses durable Redis storage. The dev command loads `.env.local` and the process environment; keep sandbox secrets in the gitignored local file.

## Production activation

1. Connect an Upstash Redis REST database using `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Equivalent `KV_REST_API_URL` and `KV_REST_API_TOKEN` names are supported.
2. Confirm shop hours and service durations. University has sourced menu prices and durations. Other shops require verified overrides in `SERVICE_CATALOG_JSON`, keyed by location ID, then service ID, for example `{"apache":{"regular-haircut":{"durationMins":30,"priceCents":3300}}}`. This example is syntax only, not a verified Apache price. Location IDs are `university`, `apache` and `scottsdale`; service IDs are in `catalog.mjs`.
3. Set `BOOKING_CAPACITY_JSON` to the actual simultaneous capacity allocated to this system, such as `{"university":1}` if the owner reserves one chair for online appointments. Set `BOOKING_ACTIVE_LOCATIONS` to a comma-separated list of approved shops.
4. Connect Hairflix's Stripe account with `STRIPE_API_KEY`, set `PUBLIC_ORIGIN` to the production HTTPS origin and configure a Stripe webhook at `/api/stripe/webhook`. Subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`; set its signing secret as `STRIPE_WEBHOOK_SECRET`. Use test-mode credentials for payment verification before switching to live credentials.
5. Set `BOOKING_ENABLED=true` only after verifying the full test payment and booking workflow. Redeploy after changing environment variables.

Each checkout collects a $5 USD deposit toward the service. The remaining balance is paid at the shop. Checkout expires after 30 minutes; the temporary capacity hold lasts 35 minutes. Payment confirmation requires a signed Stripe webhook matching the stored checkout, booking, currency and amount. Returning to the success URL alone never confirms an appointment. Late payments that cannot safely claim capacity enter `payment_review` and require staff follow-up.

## API

- `GET /api/config`: public catalog and readiness flags; contains no credentials.
- `GET /api/availability?location=university&service=regular-haircut&date=YYYY-MM-DD`: available starts in America/Phoenix. Returns no fabricated slots when disconnected.
- `POST /api/bookings`: requires location, service, start, name, email, phone and `privacyConsent:true`. `marketingConsent` is separate and optional. Returns a hosted checkout URL and an unguessable booking-status token.
- `GET /api/bookings/:id?token=...`: status and appointment details, without customer contact information.
- `POST /api/stripe/webhook`: raw-body signed payment events.
- `GET /api/admin/bookings?date=YYYY-MM-DD`: staff lookup, requiring `Authorization: Bearer ...` matching `BOOKING_ADMIN_TOKEN` of at least 32 characters. Treat the response as private customer information.

Redis uses atomic slot holds to prevent overlapping reservations within the configured capacity. Start times follow shop hours, use a one-hour lead time and are offered in 15-minute increments. Failed checkout creation releases the hold. Expired holds release capacity automatically.

## Staff and marketing

The backend records optional marketing permission separately from required appointment contact permission. It does not send campaigns, reminders or confirmations. No email/SMS provider, staff dashboard, external calendar sync or automated refund flow is claimed. Staff must review confirmed bookings and `payment_review` records, handle cancellations/refunds in Stripe and implement the shop's retention process. Never expose the admin token in browser JavaScript or commit customer data.

Until production activation the website offers the verified shop phone numbers and existing booking provider instead of accepting a deposit.

## Stripe Connect sandbox

Owner and independent-barber onboarding/payout panels use a separate sandbox-only backend. Follow [the full sandbox setup guide](../docs/stripe-connect-sandbox.md). The public role selector does not grant access to financial accounts. This does not activate the standalone booking/deposit flow or connect browser-local tickets to payment settlement.
