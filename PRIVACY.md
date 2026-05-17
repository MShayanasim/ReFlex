# ReFlex — Privacy Policy

**Last updated:** May 17, 2026

## Overview

ReFlex is a browser extension that enhances the visual experience of the FAST-NUCES Flex student portal. This privacy policy explains what data the extension accesses, how it is used, and how it is stored.

## Data Collection

ReFlex does **not** collect, transmit, or share any personal data. Specifically:

- **No analytics or tracking** — ReFlex does not include any analytics services, telemetry, or tracking pixels.
- **No external network requests** — ReFlex does not send data to any server, API, or third-party service. All processing is performed entirely within your browser.
- **No account or login data** — ReFlex never accesses, reads, or stores your Flex portal credentials.

## Data Accessed

ReFlex reads content from the FAST-NUCES Flex portal pages (`*.nu.edu.pk`) to render its enhanced dashboard. This includes:

- **Marks data** — Assessment names, scores, weightages, and class averages displayed on the Marks page.
- **Transcript data** — Course names, codes, grades, credit hours, and GPA information displayed on the Transcript page.
- **Attendance data** — Presence/absence records and lecture durations displayed on the Attendance page.

This data is read directly from the page's HTML and is **never** transmitted outside your browser.

## Data Stored

ReFlex uses Chrome's built-in extension storage (`chrome.storage.sync`) to persist:

| Data | Purpose |
|------|---------|
| UI theme preference (light/dark) | Remembers your chosen theme |
| UI toggle state (enabled/disabled) | Remembers whether ReFlex UI is on or off |
| Marks snapshot | A local cache of your most recent marks, used solely to detect NEW and UPDATED grades on your next visit |

All stored data:
- Resides **entirely on your device** (or synced via your Google account if Chrome Sync is enabled).
- Can be cleared at any time by uninstalling the extension.
- Is **never** sent to any external server.

## Permissions

| Permission | Reason |
|------------|--------|
| `storage` | Save your theme preference and marks snapshot locally |
| `activeTab` | Reload the active tab when you toggle the extension on/off from the popup |
| `host_permissions` (`*.nu.edu.pk`) | Inject the enhanced UI only on the FAST-NUCES Flex portal |

## Third-Party Services

ReFlex uses **no** third-party services, libraries, or CDNs. All assets (including fonts) are bundled locally within the extension.

## Changes to This Policy

If this privacy policy is updated, the changes will be reflected in this document with an updated date. No data practices will change without updating this policy.

## Contact

If you have any questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/shayan-asim10/ReFlex).
