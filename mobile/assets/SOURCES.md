# Assets

Lara, Jose, Watkins and shop photography are copied from the existing Hairflix project (`dist/app/assets`). They are bundled locally so the native preview does not depend on protected website image URLs. Preserve the source project's asset permissions when distributing the app.

Goodchair app icons use an original AI-generated g. monogram, exported into opaque iOS, transparent Android adaptive/monochrome, splash and favicon assets. The full icon is cream on burgundy (#B72438). Adaptive foreground artwork is centered within a conservative safe zone; OS launchers apply their own shape. Hairflix website favicons retain the existing H identity. No Expo starter icons remain in these exports.

DM Sans regular and semibold are bundled as native TTF files, converted without changing glyphs from the website's local WOFF files (`dist/assets/fonts`). The OFL license is included in `fonts/DM-Sans-LICENSE.txt`. These fonts and profile images load from the app bundle, not from the protected website.
