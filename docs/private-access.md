# Private invitation access

Vercel's framework-independent proxy runs before static/CDN responses and checks a signed HttpOnly cookie for the marketing site, workspace picker, app, profile links and app assets. The API also checks access independently. The invitation page and its CSS/JS/fonts are public; Stripe's signed webhook endpoints remain machine-accessible and verify their own signatures.

Vercel production settings: `SITE_ACCESS_ENABLED=true`, a salted scrypt `SITE_ACCESS_PASSWORD_HASH`, and an independent 32+ character `SITE_ACCESS_COOKIE_SECRET`. Never put the password or cookie secret in client JavaScript. Rotate the cookie secret to expire all invitations immediately. Cookie persistence is 30 days with Remember enabled; otherwise it lasts for the browser session with an 8-hour token expiry. SameSite=Lax allows an existing invitation cookie to work when opening a profile link from another site.

The entrance is `/welcome/`. It returns people to their original safe same-origin URL after the password succeeds. Its NDA link states that the agreement is coming soon; it does not claim anyone signed a legal agreement.

For local work, configure equivalent test secrets in `.env.local`, use `PUBLIC_ORIGIN=http://127.0.0.1:8092`, and run `npm run dev`. An explicit `SITE_ACCESS_ENABLED=false` disables this invitation gate for local-only work. Missing secrets fail closed when enabled. Production and Preview settings are independent: Preview deployments need their own invitation secrets or remain closed.

Shared barber links keep their profile content and hide the store selector, account controls, notifications and all-barbers shortcut. Booking, messaging, favorites and bottom navigation prompt a short name/email sign-up before opening the full customer experience. That sign-up is browser-local in the current prototype; it is not production customer authentication and sends no emails. It is separate from the server-enforced whole-site invitation password.
