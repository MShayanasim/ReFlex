const fs = require('fs');

// ── FIX 1: ff-observer.js — guard document.body null ────────────────────────
let obs = fs.readFileSync('ff-observer.js', 'utf8');

// Fix line 40: wrap in body check
obs = obs.replace(
    'scanObserver.observe(document.body, { childList: true, subtree: true });\n}',
    'if (document.body) {\n        scanObserver.observe(document.body, { childList: true, subtree: true });\n    } else {\n        document.addEventListener("DOMContentLoaded", () => {\n            if (scanObserver) scanObserver.observe(document.body, { childList: true, subtree: true });\n        });\n    }\n}'
);

// Fix line 120: guard watcher also needs body check
obs = obs.replace(
    'guardObserver.observe(document.body, { childList: true, subtree: true });\n}',
    'if (document.body) {\n        guardObserver.observe(document.body, { childList: true, subtree: true });\n    }\n}'
);

fs.writeFileSync('ff-observer.js', obs);
console.log('[OK] ff-observer.js — document.body guard added');

// ── FIX 2: runTranscript.js — semester name extraction ──────────────────────
let rt = fs.readFileSync('runTranscript.js', 'utf8');

// Replace the full semester name block with a corrected version
const oldBlock = /\/\/ Find semester name.*?if \(!semName\) semName = 'Semester ' \+ \(semesters\.length \+ 1\);/s;

const newBlock = `// Find semester name — try multiple strategies
        let semName = '';
        const semPattern = /\\b(Fall|Spring|Summer)\\s+\\d{4}\\b/i;

        // Strategy 1: look inside portlet head text (NOT th/td cells)
        let container = table.closest('.m-portlet, .m-portlet--mobile, [class*="portlet"]');
        if (container) {
            const headEl = container.querySelector(
                '.m-portlet__head-text, .m-portlet__head-title, .m-portlet__head-caption'
            );
            if (headEl) {
                const raw = headEl.innerText || headEl.textContent || '';
                const m = raw.match(semPattern);
                if (m) semName = m[0];
                else {
                    // Try the raw text without Cr.Att suffix
                    const cleaned = raw.split(/Cr\\.?\\s*Att/i)[0].trim().split('\\n')[0].trim();
                    if (cleaned && cleaned.length < 40) semName = cleaned;
                }
            }
        }

        // Strategy 2: scan page headings (h2/h3/h4 only — NOT th/td)
        if (!semName) {
            const headings = document.querySelectorAll(
                'h1, h2, h3, h4, .m-portlet__head-text, .m-subheader__title'
            );
            for (const el of headings) {
                const text = el.innerText || el.textContent || '';
                const m = text.match(semPattern);
                if (m) { semName = m[0]; break; }
            }
        }

        // Strategy 3: check the page URL for academic year hints, fallback to index
        if (!semName) semName = 'Semester ' + (semesters.length + 1);`;

if (oldBlock.test(rt)) {
    rt = rt.replace(oldBlock, newBlock);
    fs.writeFileSync('runTranscript.js', rt);
    console.log('[OK] runTranscript.js — semester name extraction fixed (th removed from selector)');
} else {
    console.log('[MISS] runTranscript.js — pattern not found, showing context:');
    const i = rt.indexOf('Find semester name');
    console.log(rt.substring(i, i + 400));
}

// ── FIX 3: styles.css — fix padding specificity properly ────────────────────
let css = fs.readFileSync('styles.css', 'utf8');

// The shared card rule is: .ff-progress-card, .ff-card, .ff-semester-card { padding: 24px; }
// .ff-transcript-card must beat this. We'll use a combined selector for higher specificity.
// Remove any existing ff-transcript-card padding rules and replace with a high-specificity one.

// First check current state
const cardIdx = css.indexOf('.ff-transcript-card');
console.log('Current .ff-transcript-card block:', css.substring(cardIdx, cardIdx + 80));

// Replace with high-specificity selector
css = css.replace(
    /\.ff-transcript-card \{\n\s*padding:[^;]+;\s*(!important)?\n\}/,
    '.ff-semester-card.ff-transcript-card {\n    padding: 36px 42px;\n}'
);

fs.writeFileSync('styles.css', css);

// Verify
const verIdx = css.indexOf('ff-transcript-card');
console.log('[OK] styles.css — updated:', css.substring(verIdx, verIdx + 80));
