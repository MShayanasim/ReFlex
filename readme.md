### ReFlex — Better Flex for FAST-NUCES Students

The official FAST Flex portal works. It just barely does.

ReFlex is a Chrome Extension that completely replaces the Flex student portal experience with a handcrafted, premium dashboard. Built by a FAST student, for FAST students — every single feature was designed to solve a real frustration with the original UI.

---

### ⚔️ ReFlex vs. Original Flex — Head to Head

| Feature | Original Flex | ReFlex |
|---|---|---|
| Visual design | Dated, bright, cluttered | Premium glassmorphic UI (Dark & Light) |
| Marks layout | One massive scrolling table per course | Compact horizontal tabs, zero scrolling |
| Grade changes | No notification | NEW & UPDATED badges on every change |
| GPA projection | None | Live target grade calculator |
| Class comparison | Raw numbers only | Visual progress bar with class avg pointer |
| Min / Max marks | Buried in table | Highlighted pill badge per assessment |
| Attendance insight | Percentage only | Absent hours warning & filtering |
| Page load | Flash of ugly native UI | Zero-flash veil — ReFlex loads first |
| Sidebar navigation | No active page indicator | Live sidebar pointer on every page |
| Toggle back | Impossible without uninstalling | One-click native switch in the top bar |
| Performance | Heavy server-rendered pages | Pure vanilla JS, minimal dependencies |

---

### ✨ Full Feature List

#### 🎨 Design & UX
- **Premium Dark & Light Modes** — Choose between deep navy glassmorphic backgrounds or a crisp, modern light mode. Your preference is saved automatically and can be toggled instantly with the sun/moon button in the top bar.
- **Zero-Flash Veil Technology** — ReFlex drops an invisible veil over the native UI the millisecond the page begins loading. You will never see the ugly original tables — only the finished ReFlex dashboard.
- **Compact Tab Navigation** — The Marks page replaces stacked course tables with a sleek horizontal tab bar. Switch between all your courses in a single click. No scrolling. No hunting.
- **Animated Progress Bars** — A gradient bar tracks your current weighted percentage relative to the class average, with distinct markers for both.

#### 📊 Marks Dashboard
- **Per-Course GPA Projection Engine** — Select any target grade (C through A) from a dropdown. ReFlex instantly calculates the exact percentage you need to score across your remaining coursework to reach that grade. If it's mathematically impossible, it tells you clearly.
- **Current Grade & GPA Badge** — Your live grade and GPA points are displayed prominently with a colour-coded badge (emerald for A, indigo for B, amber for C, and so on).
- **NEW & UPDATED Ghost Tracking** — ReFlex saves a local snapshot of your marks. When a teacher uploads a new quiz or edits a previous score, the changed row is instantly tagged with a bright `NEW` or `UPD` badge. You always know exactly what changed since your last visit.
- **Below-Average Warning** — Every assessment that you scored below the class average is automatically flagged with a `!` warning indicator, so you know precisely where you lost ground.
- **Class Average Analytics** — Every single assessment row shows the class average right alongside your score for instant comparison.
- **Minimum & Maximum Marks** — Know the highest and lowest scores in the class for every assessment with a subtle purple `Min X | Max Y` pill badge.
- **Graded vs. Remaining Breakdown** — A clear stats row always shows how much of your grade has been evaluated and how much of the final percentage is still unplayed.

#### 📅 Attendance Page
- **Absents Allowed Counter** — ReFlex calculates and displays exactly how many more hours you can afford to miss before dropping below the 80% threshold — directly above each course attendance table.
- **Live Absent Hours Warning** — Tracks your absent hours and warns you with bold status messages when you enter the danger zone.
- **Show Absents Only Filter** — A dedicated button above each table lets you instantly filter to show only the dates you were absent, saving you from scrolling through long tables.

#### 📜 Transcript Page
- **Semester Tab Navigation** — Navigate through your entire academic history with a sleek horizontal tab bar, separated cleanly by semester.
- **SGPA & CGPA Rings** — Every semester tab features beautifully styled visual rings displaying your Semester GPA and Cumulative GPA at a glance.
- **Clean Structured Layout** — The native Transcript page gets the full ReFlex treatment with a structured, readable card layout, clearly showing credit weights and point contributions.
- **Global Credit-Hour Cache** — ReFlex reads your transcript data and stores credit-hour information locally, which it then uses to power accurate GPA calculations and attendance heuristics across the portal.

#### 🧭 Navigation & Global Controls
- **Live Sidebar Pointer** — A sharp active-page indicator follows your navigation across every section of the portal — Home, Attendance, Marks, Transcript, Course Registration, Fee Details, and more — without a page reload.
- **One-Click Native Toggle** — A minimal, premium toggle switch lives permanently in the portal's top navigation bar, right next to your profile. Flip it once to instantly reveal the original native Flex UI. Flip it back to restore ReFlex. No refresh required.
- **SPA-Aware Navigation** — ReFlex fully respects the portal's single-page navigation. It watches for URL changes, tears down cleanly, and re-injects the right UI for every page you land on.

#### ⚡ Performance & Privacy
- **Minimal Dependencies** — No React. No jQuery. ReFlex is 100% pure vanilla JavaScript with only a single Google Fonts CDN call, ensuring near-instant loading.
- **Fully Local Data** — Your marks snapshot and settings are stored in Chrome's local extension storage. Nothing is ever sent to any external server. Your academic data stays entirely yours.
- **Manifest V3 Compliant** — Built to the latest Chrome Extension security standard with a minimal, honest permission set.

---

### 🛡️ Permissions Used
- `storage` — Saves your marks snapshot locally so it can detect NEW and UPDATED grades.
- `tabs` — Required to accurately track internal page navigation within the portal.
- `host_permissions` — Scoped exclusively to the FAST Flex portal to inject the UI.

---

**Built with 🖤 at FAST-NUCES Karachi.**
