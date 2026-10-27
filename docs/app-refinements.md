# App refinements

The app remains a browser-local working prototype. Role switching is not authentication; all records must stay sample-only. No real payments or messages are sent.

Changes: landing-page fonts and palette, owner location-scoped calendar and recorded-data metrics, barber photos alongside text-only client names, staff-created appointments with conflict validation, owner employment labels, recorded work/time-off/no-show stats, range-selected vacation blocks, messaging shortcuts, phone details, account icons, Arizona open status, inactive payment preview.

Availability supports mouse drag and touch start/end selection, plus explicit date and time inputs. Blocks prevent overlapping appointments. Existing appointments must be rescheduled before overlapping time off is saved. Workdays count distinct dates with approved tickets through today. Days off count distinct full-day blocks within the current month. No-show rate uses explicitly marked no-shows and completed/approved visits; no observations displays an em dash. No payroll or attendance inference is made from uncompleted bookings. University and Scottsdale hours follow dist/data.js; shop overrides and holiday schedules need configuration before production.

Manual appointment entry supports owners choosing any barber; the Barber Pro preview is Lara and can book only Lara. Supported time choices retain the prototype's existing time list. Real authorization and simultaneous scheduling protection require a backend.

Card fields are disabled and not collected. Apple Pay and Google Pay are placeholders until a payment integration is implemented, not merely keys entered.

Verification: existing 10 backend tests; Chromium checks for manual booking creation, duplicate-time rejection, vacation conflict rejection and persistence, employment label persistence, phone persistence, messaging actions, and disabled payments. All existing registered screens rendered across all three roles, and desktop drag selection was exercised. Browser checks use the environment-provided Playwright and Chromium and temporary test scripts outside the repository.
