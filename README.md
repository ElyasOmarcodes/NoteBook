# Notes — Home Controller (parental control)

A native Android (Kotlin + Jetpack Compose) parental-control app, intended for a
parent to manage their own young child's phone. It presents itself as an ordinary
notes app; the control panel is reachable only with a private code.

> Intended use: managing a device that belongs to your own family. Set it up
> openly with the people who use the phone.

## Features

- **Call allow-list** — with the filter on, only numbers you add can ring the
  phone; all other incoming calls are rejected (Android `CallScreeningService`).
- **App lock** — chosen apps (WhatsApp, Facebook, Instagram, TikTok, YouTube,
  etc. by default) require the unlock code before they open. Newly installed
  social apps are locked automatically.
- **Disguised entry** — the launcher looks like a notes app with a generic icon.
  Long-press the **Notes** title and enter the master code to open the hidden
  control panel.
- **Uninstall protection** — optional device-admin so the app can't be casually
  removed by the child.
- **Material 3 UI** — soft, modern Compose interface.

## Default codes (change them after first launch)

| Purpose | Default |
|---|---|
| Master code (open control panel) | `1379` |
| App unlock code | `2468` |

Change both from **Control Panel → Security**.

## First-run setup

1. Install the APK and open **Notes**.
2. Long-press the **Notes** title → enter `1379`.
3. In **Home**, grant: Call screening, App lock service (Accessibility),
   Display over apps, and (optionally) Uninstall protection.
4. Add allowed numbers under **Calls**; adjust locked apps under **Apps**.

## Building

APKs are built automatically by GitHub Actions
(`.github/workflows/build-apk.yml`) on every push and attached to a GitHub
Release. To build locally you need JDK 17 and Gradle 8.9+:

```bash
gradle assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

The release APK is signed with the debug key so it installs via sideload without
a private keystore. Replace the signing config for a production build.

## Tech

- Kotlin 2.0, Jetpack Compose (Material 3), DataStore
- `compileSdk`/`targetSdk` 35, `minSdk` 29 — built to keep working on newer
  Android releases.
