# Hairflix design and verification

The user's earlier mobile conversion template is adapted to Hairflix's real charcoal/red brand, with strong self-hosted Barlow Condensed headings and DM Sans body copy. The Taste contact-sheet direction informs the immediate display of real haircut photographs and the gallery. Ivory is retained from the requested template.

Verified on 20 October 2026 from the three supplied Google profiles:

- University: 1301 E University Dr Unit 136, Tempe. 4.9 from 2,420 Google reviews. (480) 559-4539. CID 9822827895141772229.
- Apache by Vodi: 922 E Apache Blvd #108, Tempe. 5.0 from 1,288 Google reviews. (602) 860-5995. CID 11236650050424087475.
- Scottsdale: 7349 N Vía Paseo Del Sur Ste 520, Scottsdale. 5.0 from 477 Google reviews. (602) 785-1988. CID 3728222775588814031.

All location photographs are from their actual Google profiles. The work gallery combines real business website images and Google profile photographs. The three short testimonial excerpts have primary Google review links. See dist/assets/assets-sources.json and google-review-excerpts.json for sources. No generated work pictures or testimonials.

University prices and service durations come from https://getsquire.com/discover/barbershop/hairflix-barbershop-tempe . Other locations' prices are not inferred. Review counts are a snapshot, not a live review feed. Structured data includes shop identities and addresses without self-serving aggregate-rating markup.

Chromium/touch layouts checked at 320, 375, 390, 768 and 1440px: all visible images decode; all three correct business map CIDs, eight services, three sourced review excerpts and shop-specific phone/booking links present; no horizontal overflow or JavaScript errors. Four-stage booking UI has error/fallback states and separate unchecked marketing consent. New payment confirmations are gated on backend verification.

Impeccable's source detector reports intentional inherited ivory and source-only section inset warnings. Rendered screenshots show the sections use the shared 20px mobile/80px desktop outer frame and section padding; no content touches those section edges. These warnings are not presented as a clean whole-site detector pass. The final Taste source lint passes after SVG rating stars replace text glyphs.

Production booking requires the actual shop capacity/calendar, a durable Redis connection and Hairflix's payment account/webhook. Without them, the website does not fabricate slots, collect unusable booking data or claim payments; direct shop calls and current online booking remain available. Tests do not charge cards, contact clients or create real appointments.

The full Taste browser inspector was run as well. Its tablet headline wrapping finding was corrected with a fluid tablet size; the final heading stays at two lines. The identical-icon finding covers functional service/pricing and Google-review controls retained for the requested template. Its motion counter did not observe the existing one-shot Web Animations API entrances; no clean inspector pass is claimed. The palette and brand-font warnings are deliberate; no business video was supplied, so real still photographs are used instead of unrelated stock footage.
