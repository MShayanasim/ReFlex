### ReFlex — Better Flex for FAST-NUCES Students

[![Chrome Web Store Version](https://img.shields.io/chrome-web-store/v/hljpjnkdjelocgcgocknamkjafgbfkfg.svg?label=Chrome%20Web%20Store&color=blue&logo=googlechrome&logoColor=white&style=for-the-badge)](https://chromewebstore.google.com/detail/reflex/hljpjnkdjelocgcgocknamkjafgbfkfg)
[![Tutorial/Showcase](https://img.shields.io/badge/Tutorial%2FShowcase-Watch_Video-red?logo=youtube&logoColor=white&style=for-the-badge)](https://drive.google.com/file/d/1lry20sllleA1AT1_nennfn8N0foRct6B/view?usp=sharing)

The official FAST Flex portal works. It just barely does.

ReFlex is a Chrome Extension that completely replaces the Flex student portal experience with a handcrafted, premium dashboard. Built by a FAST student, for FAST students — every single feature was designed to solve a real frustration with the original UI.

---

### ⚔️ ReFlex vs. Original Flex — Head to Head

| Feature | Original Flex | ReFlex |
|---|---|---|
| Visual design | Dated, bright, cluttered | Premium glassmorphic UI (Dark & Light) |
| Marks layout | One massive scrolling table per course | Compact horizontal tabs, zero scrolling |
| Grade changes | No notification | Background push email alerts & visual badges |
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
- **Premium Dark & Light Modes** — Choose between deep navy glassmorphic backgrounds or a crisp, modern light mode. This even applies to the usually glaring native login screen! Your preference is saved automatically and can be toggled instantly with the sun/moon button in the top bar.
- **Zero-Flash Veil Technology** — ReFlex drops an invisible veil over the native UI the millisecond the page begins loading. You will never see the ugly original tables — only the finished ReFlex dashboard.
- **Compact Tab Navigation** — The Marks page replaces stacked course tables with a sleek horizontal tab bar. Switch between all your courses in a single click. No scrolling. No hunting.
- **Animated Progress Bars** — A gradient bar tracks your current weighted percentage relative to the class average, with distinct markers for both.

#### 📊 Marks Dashboard
- **Recent Updates Drawer** — A slide-out drawer aggregates all new or updated marks across all your courses in one place. Clicking an update automatically switches to that course tab and scrolls to the exact highlighted row.
- **Live Sync Engine ("Ghost Sync")** — A dedicated Sync button on the Marks page silently fetches your latest marks from the server in an invisible background frame and hot-swaps the UI without ever reloading the page. It even automatically runs in the background every few minutes to keep you instantly up to date.
- **Interactive First-Time Tutorial** — When you first open the Marks page, an elegant, interactive overlay tutorial highlights and explains all the new features, complete with a replay button in the extension popup.
- **Per-Course GPA Projection Engine** — Select any target grade (C through A+) from a dropdown. ReFlex instantly calculates the exact percentage you need to score across your remaining coursework to reach that grade. It clearly displays how many points each course contributes to your SGPA, and automatically locks courses whose grading is mathematically complete.
- **Best of N / Drop Logic Support** — Fully supports complex grading structures where the lowest quizzes or assignments are dropped. Dropped items are visually struck through so you know exactly which scores are contributing to your final total.
- **Current Grade & GPA Badge** — Your live grade and GPA points are displayed prominently with a colour-coded badge (emerald for A, indigo for B, amber for C, and so on).
- **NEW & UPDATED Tracking** — ReFlex saves a local snapshot of your marks. When a teacher uploads a new quiz or edits a previous score, the changed row is instantly tagged with a bright `NEW` or `UPD` badge. You always know exactly what changed since your last visit.
- **Below-Average Warning** — Every assessment that you scored below the class average is automatically flagged with a `!` warning indicator, so you know precisely where you lost ground.
- **Class Average Analytics** — Every single assessment row shows the class average right alongside your score for instant comparison. You can click on the scores in the Grand Final Marks card to instantly toggle between raw Marks and Weightage percentages.
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
- **Automated Email Notifications** — The crown jewel of ReFlex. When enabled, ReFlex silently monitors your portal in the background. If a teacher uploads a new mark or changes an existing one, you immediately receive a beautifully formatted email alert directly to your Google inbox! No more obsessively refreshing the portal during finals week. *(Note: This feature requires you to link your Google account and keep your Flex session logged in).*
- **Persistent Keep-Alive Heartbeat** — Fed up with session timeouts? ReFlex runs a silent background heartbeat to ensure your Flex session stays logged in continuously until you close your browser or your PC goes to sleep.
- **Live Sidebar Pointer** — A sharp active-page indicator follows your navigation across every section of the portal — Home, Attendance, Marks, Transcript, Course Registration, Fee Details, and more — without a page reload.
- **One-Click Native Toggle** — A minimal, premium toggle switch lives permanently in the portal's top navigation bar, right next to your profile. Flip it once to instantly reveal the original native Flex UI. Flip it back to restore ReFlex. No refresh required.
- **SPA-Aware Navigation** — ReFlex fully respects the portal's single-page navigation. It watches for URL changes, tears down cleanly, and re-injects the right UI for every page you land on.

#### ⚡ Performance & Privacy
- **Minimal Dependencies** — No React. No jQuery. ReFlex is 100% pure vanilla JavaScript with only bundled fonts, ensuring near-instant loading.
- **Fully Local Data & Stateless Sync** — Your marks snapshot and UI settings are stored in Chrome's local extension storage. If you enable Email Alerts, your email address and grade summaries are routed securely through a 100% stateless Cloudflare Worker to deliver the email. Nothing is ever saved to a database. Your academic data stays yours.
- **Manifest V3 Compliant** — Built to the latest Chrome Extension security standard with a minimal, honest permission set.

---

### 🛡️ Permissions Used
- `identity` — Securely fetches your Google email address to send you grade notification alerts (no passwords accessed).
- `alarms` & `offscreen` — Allows the extension to silently wake up in the background and check for grade updates without opening visible browser tabs.
- `storage` — Saves your marks snapshot locally so it can detect NEW and UPDATED grades, and saves your UI preferences.
- `notifications` — Displays native browser alerts if your Google login expires or an email fails to send.
- `host_permissions` — Scoped strictly to `*://flexstudent.nu.edu.pk/*` to inject the UI securely on the university portal only.

---

## 🚀 Installation

### 🌐 Install from Chrome Web Store (Recommended)

You can install ReFlex officially from the Chrome Web Store to get automatic updates:

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install_Now-blue?logo=googlechrome&logoColor=white&style=for-the-badge)](https://chromewebstore.google.com/detail/reflex/hljpjnkdjelocgcgocknamkjafgbfkfg)

---

### 🛠️ Manual Installation (Developer Mode)

If you prefer to install the latest developer version manually on any Chromium-based browser (Google Chrome, Microsoft Edge, Brave, etc.), follow these steps:

### Step 1: Download the Extension
1. Go to the [Releases page](../../releases) (or click the green **Code** button and select **Download ZIP**).
2. Download the latest `ReFlex v2.1.0.zip` file.
3. Extract the downloaded ZIP file to an easily accessible folder on your computer.

### Step 2: Load into Your Browser
1. Open your browser and navigate to the extensions page:
   - **Chrome / Brave:** Type `chrome://extensions/` in the URL bar and press Enter.
   - **Edge:** Type `edge://extensions/` in the URL bar and press Enter.
2. Turn on **Developer mode** (usually a toggle switch located in the top-right or bottom-left corner of the extensions page).
3. Click the **Load unpacked** button that appears.
4. Select the folder where you extracted the ReFlex files in Step 1.

### Step 3: Enjoy! 🎉
1. The ReFlex extension should now appear in your list of installed extensions.
2. Log in to the [FAST-NUCES Flex Portal](https://flexstudent.nu.edu.pk/) and navigate to your **Marks** or **Transcript** page to see the new UI in action!

> **Note:** Whenever you download a newer version of ReFlex in the future, just replace the files in your folder and click the **↻ (Refresh)** icon on the extension card in your browser to apply the updates.

---

**Built with 🖤 at FAST-NUCES Karachi.**
