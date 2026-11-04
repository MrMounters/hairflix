# Goodchair native app

React Native + Expo app for iPhone, Android and iPad, with Hairflix as the example shop. This uses native views and controls, not a WebView of the website. The original website remains in `../dist`.

## Run

Use Node 24 (the version used for validation here) and npm:

```sh
cd mobile
npm ci
npm start
```

Open with a compatible Expo Go build for **SDK 58**, or create a development/preview build. Check your installed Expo Go version: Expo's SDK transition guidance may recommend a different SDK for the App Store's current Expo Go. For a stable pilot use an EAS build matching this project, rather than changing package versions individually.

```sh
npm run web
npm run ios      # macOS and Xcode are needed for a local simulator
npm run android  # Android Studio/emulator or a connected Android device
npm run typecheck
npm test
npx expo export --platform all
```

## Included workflows

- Customer, barber and owner preview workspaces, selected from Account.
- Customer multi-service booking with combined price and duration, available quarter-hour slots, appointment details, rescheduling and cancellation.
- Barber daily schedule, check-in, sending a final-ticket request and blocked time.
- Owner multi-chair calendar, replacement-barber eligibility checks, explicit reassignment confirmation and optional in-app notification. The booked service prices are retained.
- Report an absence for a day. New bookings are blocked; unstarted bookings are marked as needing reassignment. Existing clients are not automatically cancelled or moved. In-service visits are retained.
- Messages with unread counts, grouped dates, read receipts and linked appointments.
- Customer service approval, optional tip and explicitly simulated payment. Open Customer > Home to try the seeded John B. checkout. Return to Barber/Owner to see the recorded state.
- Commission calculation setting, shareable existing web barber profile, fictional loyalty card and native tablet layout.
- AsyncStorage saves the preview on the current device. Account includes an explicit reset.

The available booking window is 9 AM–6 PM, Arizona time. Other shops, variable hours and full service/employee administration are not ported yet. Booking prices are snapshots, so later catalog edits should not rewrite old visits.

## Preview boundaries

Workspace selection is not authentication. All people, booking changes, messages, notifications and payment records here are local to this native preview. They do not update the website or another device, send SMS, collect a card, move money, or issue payouts. `paymentSource: simulation` is stored with every simulated payment.

The UI prevents editing another barber's visit, but this is not a security boundary. A production backend must independently authenticate the user and enforce every permission and transition. Do not use AsyncStorage for production authorization tokens or payment credentials.

The domain transitions in `src/domain.ts` are transport-independent. They can be reused for client guidance, but server-side transactions must enforce concurrency and be authoritative for availability and payment status.

## TestFlight and App Store

The included `app.json` enables tablets and supplies the provisional identifier `com.goodchair.preview`. Set a unique identifier owned by your Apple/Google developer organization before shipping. No Apple account, Expo project, provisioning profile or App Store submission was created here.

1. Create/link the Expo project with your own account using EAS CLI.
2. Set the final app name, bundle identifier, organization and branding. Run `npx expo-doctor` and resolve SDK/device compatibility.
3. For a development client, install the SDK-matched `expo-dev-client` with `npx expo install expo-dev-client` before using the development profile. The preview profile can be used without a development client.
4. Build for iOS with `eas build --platform ios --profile preview` for registered internal devices, or `--profile production` for TestFlight/App Store.
5. Submit the production build through your account with `eas submit --platform ios`. Complete App Store Connect screenshots, privacy disclosures, support/privacy URLs, review access and testing.

iOS and Android JavaScript exports are not signed app binaries. A successful Metro bundle does not replace running the app on actual iPhone/iPad/Android hardware.

## Next production milestone

Connect a shared backend for identity, memberships, locations, visits, blocks, messages, service snapshots and payment attempts. Add server-authorized realtime updates, transactional interval exclusion and idempotency. Then add Stripe Terminal/Connect or Clover behind a provider adapter. Only verified provider events may mark a real payment as paid. Treat customer approval, successful payment and payout as separate states.

`tests/domain.test.ts` checks scheduling boundaries, absence/reassignment, payment transitions, read receipts and cancellation. Browser checks of Expo's web target exercise the same screen code, but native device testing is still required.

Reference: [Expo project setup](https://docs.expo.dev/get-started/create-a-project/), [Expo Go version compatibility](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/), and [EAS Build](https://docs.expo.dev/build/introduction/).
