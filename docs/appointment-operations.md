# Appointment operations

The interactive app still uses browser-local records. It does not authenticate individual staff or customers, share records between devices, verify payments, or deliver SMS. The invitation password is a separate site access gate. Keep these boundaries in place until the production services are connected.

## Working now

- Open customer, barber and owner workspaces in tabs of the same browser profile and origin. Storage events update bookings, blocks, messages, read receipts, ticket approvals and recorded payment status automatically. Incoming updates preserve form drafts and focus. Returning to a tab reconciles its records.
- Booking submissions use the browser Web Locks API to serialize writes across tabs. Records are reconciled against the latest saved version before mutations, and independent changes are merged. Browsers without Web Locks still recheck local availability but cannot guarantee race exclusion.
- One scheduling rule checks quarter-hour starts, the combined duration of every service, future dates, shop hours, barber hours, blocked time and overlapping visits. It applies to customer booking, manual creation, conversation rescheduling and agenda dragging. Cancelled visits release time; existing visits remain visible after hours change.
- Owner setup is available on Overview and Manage. Six steps configure an existing location, barber names and booking eligibility, individual service menus, weekly hours and commission or rental agreements. Each Continue saves a draft; Finish applies settings. Existing bookings and their service-price snapshots are retained. Repeat setup for each existing location; adding more locations and staff uses a later production onboarding expansion.
- Customer Account includes appointment notification preferences. Text consent is off by default. Staff may record explicit customer consent when entering a manual booking. Booking changes produce in-app events and, when consent and a number exist, a text outbox entry. Outbox entries are **not sent** and are marked accordingly. Stale or opted-out entries are suppressed. A reminder is prepared within 24 hours of an upcoming visit only while the app is open.
- The existing mocked payment experience remains. Only actual changes to a payment record refresh the receipt; no elapsed timer fabricates a payment.

## Production connection still required

1. Authenticate identities, assign shop memberships and enforce customer/barber/owner access on the server. A chosen workspace is not authorization.
2. Use a persistent server database with transactional per-barber interval exclusion for appointments and blocks. Route all booking writes through it, with idempotency and version checks. The separate `/api/bookings` deposit flow is not the operational app's source of truth and must be consolidated before a pilot.
3. Publish authorized changes through realtime subscriptions or authenticated polling. Partition private messages and financial data by membership. Never expose the complete browser snapshot as a public shared endpoint.
4. Connect an SMS delivery provider with server-side credentials and a scheduled worker. Persist consent, process STOP/START and delivery webhooks, apply rate limits, deduplicate event IDs, retry transient failures, and suppress outdated reminders after changes. Do not run background reminders from browser timers in production.
5. Stripe webhooks must verify payment before recording settlement. Current browser-local payment records do not constitute verification of a real payment.

## Validation

`npm test` covers scheduling boundaries and state reconciliation, plus existing booking, ticket, payout and access behavior. Browser checks exercise six-step setup, customer preferences, multi-tab appointments/messages/read receipts, draft preservation, simultaneous manual booking, closing-time rejection, and the booking → approval → receipt flow at mobile widths.
