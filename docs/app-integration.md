# HAIRFLIX app integration

The existing public homepage and booking API remain at their original paths. The header Log in link opens /login/, with an explicit working-preview entry into /app/. All prototype assets are namespaced under /app/ to avoid collisions with the landing page.

The preview is browser-local, not authenticated. Role selection does not grant real server permissions. Do not put customer information into it. Existing booking/deposit APIs are not wired to the prototype.

Before enabling real account sign-in: connect an identity provider, enforce owner/barber/customer roles on the server, migrate local data to durable storage with access rules, then connect tickets, payments and messages. The login entry deliberately collects no passwords until authentication is available.
