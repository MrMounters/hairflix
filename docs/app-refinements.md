# App refinements

The app remains a browser-local working prototype. Role switching is not authentication; all records must stay sample-only. No real payments or messages are sent.

Changes: landing-page fonts and palette, owner location-scoped calendar and recorded-data metrics, barber photos alongside text-only client names, staff-created appointments with conflict validation, owner employment labels, recorded work/time-off/no-show stats, range-selected vacation blocks, messaging shortcuts, phone details, account icons, Arizona open status, inactive payment preview.

Availability supports mouse drag and touch start/end selection, plus explicit date and time inputs. Blocks prevent overlapping appointments. Existing appointments must be rescheduled before overlapping time off is saved. Workdays count distinct dates with approved tickets through today. Days off count distinct full-day blocks within the current month. No-show rate uses explicitly marked no-shows and completed/approved visits; no observations displays an em dash. No payroll or attendance inference is made from uncompleted bookings. University and Scottsdale hours follow dist/data.js; shop overrides and holiday schedules need configuration before production.

Manual appointment entry supports owners choosing any barber; the Barber Pro preview is Lara and can book only Lara. Supported time choices retain the prototype's existing time list. Real authorization and simultaneous scheduling protection require a backend.

Card fields are disabled and not collected. Apple Pay and Google Pay are placeholders until a payment integration is implemented, not merely keys entered.

Verification: existing 10 backend tests; Chromium checks for manual booking creation, duplicate-time rejection, vacation conflict rejection and persistence, employment label persistence, phone persistence, messaging actions, and disabled payments. All existing registered screens rendered across all three roles, and desktop drag selection was exercised. Browser checks use the environment-provided Playwright and Chromium and temporary test scripts outside the repository.

## Barber menus, memories and booking policy

Each barber has an independent service catalog with prices, durations, descriptions and service-specific icons. The Barber Pro workspace picker is for demo role selection, not authentication. Customer bookings snapshot the chosen barber's services so later edits do not rewrite appointments. Watkins is a fictional demo barber with an AI-generated portrait. Sample openings show Lara tomorrow at 10 AM and Jose today at 3:15 PM; these are not live shop availability.

Portfolio photos and private customer haircut memories are compressed in-browser and stored locally. Customer uploads are private until explicit sharing consent, followed by barber/owner approval. Limits: four photos per visit, eight per barber, five MB per input photo and a browser storage budget. No uploads are sent to a server. Production needs authenticated storage, access rules, retention controls and cross-device synchronization.

Owner booking policy supports optional full, fixed-dollar or percentage prepayment, a deposit cancellation cutoff and a separate rescheduling notice period. Future bookings snapshot policy; changes do not rewrite old terms. Arizona time is used for deadlines. Staff can cancel and reschedule assigned appointments (owner: any appointment); customers see a live free-cancellation countdown. Required-prepayment demo bookings remain pending payment and do not claim payment success. Refund/forfeiture actions require review if an actual deposit is recorded; no payment is collected or refunded by these screens.

Owner compensation records support commission splits or daily/weekly/monthly chair rent. Monthly collection dates 29–31 use the last day in shorter months as the disclosed agreement convention; actual collection is not implemented. Card, Apple Pay, Google Pay, Cash App Pay and cash are configurable proposed methods, not active integrations.

Validation: 14 automated tests pass (including deposit rounding/capping, Arizona cutoff boundaries, rescheduling policy and record access). Chromium integration exercises personal-menu isolation, custom price/time selection, photo compression/upload, private notes, explicit sharing/approval, policy/rental persistence, customer rescheduling/cancellation/countdowns, pending-prepayment totals, demo openings and all 54 original screens; mobile service selection has no horizontal overflow.
