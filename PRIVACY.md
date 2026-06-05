# ReFlex - Privacy Policy

**Last updated:** June 5, 2026

## Overview

ReFlex is a browser extension that enhances the visual experience of the FAST-NUCES Flex student portal and provides optional automated grade notifications. This privacy policy explains what data the extension accesses, how it is used, and how it is protected.

## Data Collection & Usage

ReFlex requests only the data and permissions needed for its student dashboard and notification features.

### 1. Flex Portal Data

ReFlex reads content from the FAST-NUCES Flex student portal (`flexstudent.nu.edu.pk`) to render its enhanced dashboard and detect grade changes. This includes:

- **Marks data** - assessment names, scores, weightages, totals, and class averages.
- **Transcript data** - course names, codes, grades, credit hours, and GPA information.
- **Attendance data** - presence/absence records and lecture durations.

**How it is used:** Portal data is used to build the dashboard, calculate local GPA/attendance helpers, detect new or updated marks, and show visual update badges.

**How it is protected:** Academic dashboard data and marks snapshots are stored locally on your device using Chrome extension storage. ReFlex does not sell your data, use analytics, or use tracking pixels.

### 2. Google Account Email for Optional Notifications

If you enable email notifications, ReFlex asks you to sign in with Google so it can read your Google Account email address using the OAuth scope `https://www.googleapis.com/auth/userinfo.email`.

ReFlex uses `chrome.identity.launchWebAuthFlow()` for this sign-in flow. The extension never sees or stores your Google password.

To keep notifications working in the background, ReFlex stores the following locally in `chrome.storage.local`:

- your Google email address
- OAuth access token
- OAuth refresh token
- token expiry time

These tokens are used only to authenticate notification requests and silently refresh expired access tokens through the ReFlex Cloudflare Worker.

### 3. Email Notification Delivery

When ReFlex detects a new or updated mark and email notifications are enabled, the extension sends your email address and a brief text summary of the grade update to the ReFlex Cloudflare Worker.

The Cloudflare Worker uses this information only to send an email alert through Brevo. The Worker is designed not to store your email address or grade update summaries in a database. The data is processed in memory for delivery and then discarded.

## Data Stored Locally

ReFlex uses Chrome extension storage to persist:

| Data | Purpose | Storage Type |
|------|---------|--------------|
| UI theme preference | Remembers light/dark mode | `sync` |
| UI toggle state | Remembers whether ReFlex UI is enabled | `sync` |
| Marks snapshots | Detects NEW/UPDATED grade changes | `local` |
| Badge timestamps | Keeps update badges visible for a limited time | `sync`, with local fallback |
| Google email address | Sends optional email notifications | `local` |
| OAuth access token, refresh token, and expiry | Keeps optional email notifications authenticated | `local` |
| Pending email queue | Holds grade-update summaries until they are sent successfully | `local` |
| GPA Planner projections | Saves local target-grade selections | `local` |
| Transcript credit-hour cache | Powers GPA Planner and attendance helpers | `local` |
| Tutorial status | Avoids replaying the first-time tutorial unnecessarily | `local` |

You can clear locally stored data by logging out of email notifications, clearing extension/site data in your browser profile, or uninstalling the extension.

## Permissions Explained

| Permission | Reason |
|------------|--------|
| `storage` | Saves settings, local marks snapshots, OAuth notification state, queued email alerts, and GPA Planner selections. |
| `identity` | Runs the Google OAuth sign-in flow for optional email notifications. |
| `alarms` | Allows periodic background checks for grade updates and pending email delivery. |
| `offscreen` | Parses Flex portal HTML in the Manifest V3 background context without opening a visible tab. |
| `notifications` | Shows local browser notifications if email delivery or authentication needs user attention. |
| `host_permissions` for `*://flexstudent.nu.edu.pk/*` | Allows ReFlex to run only on the FAST-NUCES Flex student portal and fetch portal pages needed for grade checks. |

ReFlex does not request `activeTab`, `tabs`, browsing history, cookies, or access to all websites.

## Third-Party Services

ReFlex uses:

- **Google OAuth / Google userinfo** - to obtain your email address for optional notifications.
- **Cloudflare Workers** - to securely exchange/refresh OAuth tokens and route email notification requests.
- **Brevo** - to deliver notification emails.

No analytics services, advertising SDKs, telemetry tools, tracking pixels, or remotely hosted frontend code are used by the extension.

## Google API Limited Use

ReFlex's use and transfer of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Google account data is used only to provide the user-facing email notification feature.

## Changes to This Policy

If this privacy policy is updated to reflect new features, permissions, or data handling changes, the date at the top of this document will be updated.

## Contact

If you have questions about this privacy policy or how your data is handled, please open an issue on the [GitHub repository](https://github.com/MShayanasim/ReFlex).
