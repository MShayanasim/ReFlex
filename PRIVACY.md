# ReFlex — Privacy Policy

**Last updated:** June 4, 2026

## Overview

ReFlex is a browser extension that enhances the visual experience of the FAST-NUCES Flex student portal and provides automated grade notifications. This privacy policy explains what data the extension accesses, how it is used, and how it is protected.

## Data Collection & Usage

ReFlex is built with privacy as a core principle. The extension only requests the minimum data necessary to function:

### 1. Flex Portal Data (Local Only)
ReFlex reads content from the FAST-NUCES Flex portal pages (`*.nu.edu.pk`) to render its enhanced dashboard and detect grade changes. This includes:
- **Marks data** — Assessment names, scores, weightages, and class averages.
- **Transcript data** — Course names, codes, grades, credit hours, and GPA information.
- **Attendance data** — Presence/absence records and lecture durations.

**How it is protected:** Your academic data is stored locally on your device using Chrome's built-in extension storage (`chrome.storage.local`). It is **never** transmitted to our servers, sold, or shared with any third party.

### 2. Google Account Email (For Notifications)
To power the Automated Background Email Notifications feature, ReFlex requests access to your authenticated Google Account email address via the Chrome Identity API (`chrome.identity`).

**How it is protected:** 
- The extension only requests your email address. It never sees or has access to your Google password. Your OAuth access token is securely generated via a standard Web Authentication Flow and explicitly stored only in Chrome's local storage (`chrome.storage.local`).
- When a grade update is detected in the background, your email address and a brief text summary of the grade change are sent securely to our serverless Cloudflare Worker (`reflex-notifier`).
- The Cloudflare Worker uses this data strictly to dispatch an email alert to you via an SMTP provider (Brevo).
- The Cloudflare Worker operates completely statelessly. **Your email address and grade updates are never logged, saved, or stored in any database on our servers.** They exist in memory just long enough to send the email, and are immediately destroyed.

## Data Stored Locally

ReFlex uses Chrome's built-in extension storage to persist:

| Data | Purpose | Storage Type |
|------|---------|--------------|
| UI theme preference | Remembers your chosen theme (light/dark) | `sync` |
| UI toggle state | Remembers whether ReFlex UI is on or off | `sync` |
| Email notifications state | Remembers if notifications are enabled/disabled | `sync` |
| Marks snapshot | A local cache of your marks, used to detect NEW/UPDATED grades and trigger email alerts | `local` |
| GPA Planner projections | Saves your target grades locally so you do not lose your sandbox values | `local` |

All stored data can be cleared at any time by uninstalling the extension.

## Permissions Explained

| Permission | Reason |
|------------|--------|
| `identity` | Required to securely fetch your Google email address for grade notification alerts without requiring a password. |
| `identity.email` | Specifies that only the email address is needed from the identity scope. |
| `alarms` | Allows the extension to wake up periodically in the background to check for new grades. |
| `offscreen` | Required by Manifest V3 to parse the Flex portal HTML in the background without opening visible tabs. |
| `storage` | Required to save your theme preference, settings, and local marks snapshot. |
| `activeTab` | Allows the extension to interact with the currently active portal tab without requiring broad history permissions. |
| `host_permissions` | Scoped exclusively to `*://*.nu.edu.pk/*` to inject the UI securely on university pages and fetch grade updates. |

## Third-Party Services

ReFlex uses a secure, serverless Cloudflare Worker solely for routing emails via Brevo SMTP. No analytics services, telemetry, tracking pixels, or external libraries (e.g. React, jQuery) are used in the extension frontend.

## Changes to This Policy

If this privacy policy is updated to reflect new features or permissions, the changes will be reflected in this document with an updated date.

## Contact

If you have any questions about this privacy policy or how your data is handled, please open an issue on the [GitHub repository](https://github.com/MShayanasim/ReFlex).
