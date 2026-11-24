# Hairflix mobile app

Native React Native + Expo app for customers, barbers and owners. The app now uses authenticated shared server storage instead of selectable local demo roles.

See [implementation, setup and release status](../docs/hairflix-platform.md) for the feature matrix, backend configuration, notification worker and remaining release requirements.

```sh
npm ci
cp .env.example .env.local
# Set EXPO_PUBLIC_APP_API_URL to your reachable Hairflix backend URL.
npm start
```

Use Node 24 and Expo SDK 58. A physical phone needs a reachable HTTPS backend, not the computer’s localhost address. Native bearer credentials use SecureStore. The web target uses sessionStorage and must have its origin authorized by the server.

```sh
npm run typecheck
npm test
npx expo export --platform all
```

The owner activates the first account with a private server-configured activation token. Barber/other owner accounts require invitations. Customers can register independently. Internal pilot bookings do not synchronize to Squire, and online card payments are unavailable.

## TestFlight

The Hairflix app icons are included. `com.hairflix.preview` is a provisional bundle identifier; replace it with the identifier registered in the owner’s Apple organization before the first signed build. No EAS project or Apple signing credentials were created by this change.

1. Sign in to Expo CLI/EAS with your account and link the correct organization’s EAS project using `eas init`.
2. Configure the final bundle identifier, EAS project ID, production `EXPO_PUBLIC_APP_API_URL`, Apple push credentials and the hosted backend described in the setup guide.
3. Use `eas build --platform ios --profile production` for a TestFlight build, then `eas submit --platform ios --profile production` through the authorized App Store Connect organization.
4. Finish privacy/support metadata, review access and hardware tests before inviting shop staff.

For the development-client profile, install `expo-dev-client` with `npx expo install expo-dev-client` first. The preview profile is for registered internal devices. A successful JavaScript export is not a signed `.ipa` and does not prove hardware/push behavior.
