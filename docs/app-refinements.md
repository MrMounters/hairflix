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

## Workspace entry and sample portfolios

/login/ is the role-selection screen for Customer, Barber Pro, and Owner HQ. /app/ requires a preview choice and remembers it for the browser session. Switch workspace returns to /login/. This remains preview navigation, not authentication or a permission boundary.

Three AI-generated, fictional side-profile customer photos populate the barber portfolios once without replacing existing uploaded work. Each work card shows its barber's portrait and name at the top right and marks synthetic samples as fictional. The signed-in preview barber's portrait also appears in the app header. No customer photos are added to calendar client names.

## Booking and conversation updates
- Manual bookings offer Appointment and Walk-in. Appointments show date and time; walk-ins use the next slot today and retain conflict checks.
- Messages use the existing app inbox, with client photos, recency ordering, an Unread filter, blue dots and initial red counts of 3, 1 and 1 per barber workspace.
- Reading a thread clears only that viewer's unread state. Customer and assigned barber reads update receipts across browser tabs; owner reads do not impersonate a barber read.
- Staff can create a booking from a conversation. Booking and reschedule cards retain the time posted, while the latest card offers the existing appointment controls. Customer booking confirmations also post to the conversation.
- Staff and portfolio photos display complete images, and availability labels use normal text.

Validation: existing Node suites and messaging state tests; Chromium checks for initial badges, badge clearing, creation and rescheduling from chat, saved booking dates, two-tab Delivered → Read transitions in both directions, walk-in persistence, and a 390px layout without horizontal overflow. No JavaScript errors in those browser flows.

Messaging and these workspace bookings continue to use browser-local storage. They synchronize between tabs on the same origin, not between different devices or authenticated accounts.

### Customer portraits and normal opening labels
Generated haircut portraits now identify fictional clients consistently in the barber inbox, calendar, daily schedule, ticket lists and appointment cards. Owner appointment and conversation views show the customer and assigned barber as overlapping portraits; unknown clients receive their own initials. Opening labels show the next future slot that fits the service duration and recorded conflicts, with no demo wording or repeated barber name.

## Compact store, booking and messaging screens
Workspace/sample controls are removed from all three app roles; barber work defaults to Lara and the store selector is labeled Switch store. Profile actions use icons, staff portraits use the earlier crop, and portfolio photos fill their frames without fictional/demo labels. Services use compact tiles and selection updates in place, preserving the portrait DOM node.

Scheduling uses quarter-hour times throughout, including manual booking and rescheduling. Five-day date windows advance in either direction, with recorded illustrative days off disabled. Preferred barber openings are Lara at 3 PM today, Jose at 6 PM today and Watkins at 11 AM tomorrow, falling back to a future opening after those times pass. Manual forms place Walk-in/Appointment radio cards first and allow multiple service checkboxes; durations, prices and service snapshots aggregate across all selected services.

Mobile messaging uses a fixed viewport with a conversation list/back action and an internally scrolling history. The general shop thread uses the company logo and an introductory conversation about Lara. Staff schedules show customer portraits and appointment estimates. Ticket service editors show name, price and remove on one row with quantity fixed at one. Customer correction-request UI is removed. The customer rewards card has ten spaces, three initial stamps, a half-price fifth visit and free tenth visit. Private feedback uses five rating options and explicitly identifies management as the only audience. Haircut memory uploads have a styled photo prompt. Policy text follows payment methods and starts with Reschedule/Cancellation Policy:.

Validation: Node suites; Chromium at 390×844 checked service selection without replacing the portrait, five-day dates, fixed chat with company logo, and manual booking of two services at 10:15 AM. Additional checks cover staff calendars and compact customer screens. Browser-local messaging/payment limitations remain as documented above.

## Mobile inbox sizing and appointment-time correction
The message page's flex child combined auto margins with an unconstrained inbox list, producing a narrow centered column and horizontal overflow. Explicit full-width flex children and constrained previews restore the phone layout. The viewport includes iOS safe areas; form controls use a 16px mobile font to avoid focus-induced Safari zoom. Page scrolling remains available. Available quarter-hour booking starts are grouped into morning, afternoon and evening, without disabled filler or a clipped nested time grid. Selecting a barber uses that barber's advertised date when it is still in the future.

## Appointment-first ticket workflow
Barber navigation is Today, Calendar, Messages and Account. Daily cards and calendar rows open appointment details, an in-progress ticket or a completed receipt. A context-aware Back control restores the source view, selected date and scroll position. The legacy ticket route resolves to Calendar rather than a separate ticket directory.

Completed visits are scoped to the selected day and assigned barber. The amount in parentheses sums recorded settlements matching the approved total, including tips; approved-but-unpaid totals remain outstanding. Staff may explicitly record a cash payment from the receipt. The requested illustrative 9 AM $32 + $20 tip fixture is recorded as a cash example; it does not create a Stripe charge. Browser-only approval never automatically marks other visits paid.

Validation includes closeout totals excluding other dates/barbers, cancellations and unpaid/mismatched settlements; mobile navigation from Today through appointment/check-in/ticket and back, completed receipts, and preservation of the Calendar date.

## Customer visual redesign
The approved charcoal/red account mockup now defines the customer UI: branded header, rounded bordered surfaces, subtle red title accents, fine outline icons and a raised central Book action. Home prioritizes the next actual visit (or a booking invitation), then a compact photo banner, barber directory and rewards strip. Barber profiles use close-up staff portraits, compact booking/message/favorite actions, work photos and service rows. Visits have Upcoming/Past tabs, existing policy-enforced controls, shop directions and links to haircut memories. Account provides profile editing, visits, payment preferences, help and ten-stamp rewards; notifications remain accessible from the header bell.

Customer-only CSS and role-aware rendering preserve the staff workflow. Service selection retains its existing portrait node instead of replacing it. Time-of-day tabs expose all available quarter-hour options without a long unfiltered grid. Confirmation, receipt, feedback and memory pages inherit the customer system while retaining their existing state and forms. No payment processing, authentication or cross-device messaging capability is added by this visual change.

Validation: existing Node suites; Chromium customer booking from profile through two selected services, time selection, review, confirmation, visits and a sent message; rewards, payment preferences, past visits and haircut memories; Home/Account checked at 360, 390, 430, 768 and 1280 pixels without horizontal overflow. Staff role verified to retain its header/layout. No JavaScript errors in those browser flows. Maps were replaced with a local fixture during browser tests; live map loading was not asserted.
