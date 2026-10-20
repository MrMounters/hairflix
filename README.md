# Hairflix

A custom mobile-first website and booking system for Hairflix Barbershop. Three verified Tempe and Scottsdale locations, actual business/Google photographs, sourced reviews, shop-specific maps, a service menu, floating booking CTA and a new four-stage booking flow with a $5 deposit.

## Development

Use Node 24 (or Node 22 with node:sqlite support). Run `npm install`, then `npm run dev`. Open http://127.0.0.1:8092 . Run `node tests/booking.test.mjs` for the backend checks.

The Vercel static output is `dist`; root `api/index.mjs` serves `/api/*`. Frontend and backend stay in the same deployment. Customer data is never committed to this repository.

## Activation

The new booking calendar and deposit checkout activate only after the shop's real availability/capacity, durable Redis storage and payment account/webhook are connected. No available slot, successful payment or confirmed appointment is fabricated in the published preview. Until activation, the site offers direct shop calls and the current booking provider.

See `server/README.md` for setup and API details. See `docs/design-audit.md` and `dist/assets/assets-sources.json` for verification and photograph/review sources.
