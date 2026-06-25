# Native Release Checklist

Dog Coach is currently a PWA. For a near-native release, keep the web app as the product core and wrap it only after the PWA flow is stable.

## iOS App Store Wrapper

- Use Capacitor or a minimal WKWebView shell.
- Keep Google sign-in redirect-based for iOS standalone/webview flows.
- Add native splash screens and app icons for all required sizes.
- Provide App Privacy details: account data, pet health/training data, notifications.
- Avoid describing AI as medical diagnosis. Position it as guidance and triage support.
- Add a visible safety disclaimer in health/AI flows before App Review.
- Test push notification permissions on physical iPhone.

## Android Trusted Web Activity

- Use Bubblewrap or a minimal Android project with TWA.
- Add Digital Asset Links for the production domain.
- Reuse the PWA manifest, icons, theme colors, and start URL.
- Verify offline shell and service worker cache from a fresh install.
- Test notification channel naming and permission prompt on Android 13+.

## Store Assets

- 1024x1024 app icon.
- Phone screenshots for Today, Calendar, Academy, Diary, Profile.
- Short privacy policy URL.
- Support URL.
- Demo account or review notes if auth is required.

## Release Gates

- `npm test` passes.
- Firestore rules and indexes deployed.
- PWA install works on iOS Safari and Android Chrome.
- Calendar, event queue, and AI coach smoke-tested on a clean browser profile.
