# Public homepage and private app entry

The marketing homepage, its root assets, privacy page and booking entry are public even when SITE_ACCESS_ENABLED=true. The invitation gate remains on /login/, /app/, app assets and private APIs. The public footer's Log in link opens /welcome/?next=%2Flogin%2F, which returns authenticated visitors to workspace selection. No homepage redirect to the Good Chair invitation is needed.

All public booking CTAs use the user-supplied Hairflix Squire destination: https://getsquire.com/booking/brands/hairflix-barbershop. They open in a new tab with target="_blank", matching the source anchor supplied by the user. No iframe or custom modal intercepts the click. Shop tabs keep this same destination. Legacy /book.html uses the same direct link. No local appointments or payments are created by public booking links.
