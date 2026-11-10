# ReFlex Development Guidelines

## Floating Update Announcement Pill Specification

Whenever an update announcement or floating note is requested for a new release (e.g. "make a floating pill to let people know about the update"):

### 1. Interaction & Layout Architecture
- **Format:** Always use **Option B (Expandable Floating Pill)**.
- **Initial (Collapsed) State:**
  - Compact pill positioned fixed in the top-right corner (`top: 70px; right: 24px; z-index: 99999;`).
  - Text format: `🎉 What's New in v[X.Y]   See updates →`.
  - **No dismiss button (`×` or "Got it") in the closed state.** Students must click to expand and view the notes to dismiss.
  - **Continuous floating motion:** 3-second gentle vertical floating loop (`@keyframes ff-pill-float`).
  - **Rhythmic breathing border glow:** Border color and box shadow breathe in synchrony with the vertical bob.
  - **Hover pause:** Hovering pauses the animation (`animation-play-state: paused !important`) and locks onto a static solid blue border and aura.
- **Click-to-Expand:**
  - Clicking anywhere on the collapsed pill transitions to the expanded card via `@keyframes ff-card-expand`.
- **Expanded Card State:**
  - Header with badge: `🎉 WHAT'S NEW IN v[X.Y]` and a close `×` button.
  - Subtitle: `ReFlex has been updated to v[X.Y]!`.
  - Bullet list: 2–3 concise highlight points (bold subject + short text). No excessive emojis (only the opening 🎉 is used).
  - Feedback guidance box: Explains how to share feedback via the extension toolbar icon.
  - Primary Action Button: **"Give Feedback →"** linking directly to the Tally form (`https://tally.so/r/5BJ0lv`) with `target="_blank" rel="noopener noreferrer"`.
  - Secondary Action Button: **"Got it"** button to dismiss.

### 2. Button Styling Rules
- **Close `×` button:** Must NOT have any background box or box-shadow on hover. It simply shifts to blue (`#2563EB` in Light Mode, `#38BDF8` in Dark Mode) on hover.
- **"Got it" button:** Light background with a blue outline on hover (`border-color: #2563EB` in Light Mode, `#38BDF8` in Dark Mode).
- **Typography:** Increased base typography by `+0.5px` across all pill and card labels for enhanced readability.

### 3. Theming & Print Isolation
- **Light Mode:** Crisp white cards, subtle border `#e2e8f0`, Royal Ocean Blue `#2563EB` accents and primary button.
- **Dark Mode (`html.ff-dark`):** Deep Navy background `#0D182B`, borders `#1E2F4D`, Warm Cream text `#F4EDE0`, muted text `#CBD5E1`, Ice Blue `#38BDF8` accents and button.
- **Print Media Suppression:** Always isolate via `@media print { .ff-update-note { display: none !important; } }` so it never renders over student transcripts or attendance sheets.

### 4. Persistence & Routing Protocol
- **Component Implementation:** Driven by `FF_UPDATE_CONFIG` in `content.js`.
- **Storage Key:** Always versioned: `ff_update_v<versionKey>_note_dismissed` in `chrome.storage.local`.
- **Session Fallback:** Synchronous write to `sessionStorage` on dismiss.
- **Login Route Exclusion:** Never inject on login routes (`location.href.toLowerCase().includes('/login')`).
- **SPA Integration:** Automatically hooks into page load and SPA navigation changes (`handleNavChange` in `ff-observer.js`).
