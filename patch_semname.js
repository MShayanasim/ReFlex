const fs = require('fs');

// ── 1. FIX runTranscript.js — better semester name extraction ────────────────
let rt = fs.readFileSync('runTranscript.js', 'utf8');

const oldSemName = `        // Find semester name
        let semName = "Semester";
        let container = table.closest('.m-portlet');
        if (container) {
            let titleEl = container.querySelector('.m-portlet__head-text, h3, h4');
            if (titleEl) {
                semName = titleEl.innerText.trim();
                // Extract just the semester part (e.g. "Fall 2025") from "Fall 2025 Cr. Att:18..."
                semName = semName.split(/Cr\\.?\\s*Att/i)[0].trim();
            }
        }`;

const newSemName = `        // Find semester name — try multiple strategies
        let semName = '';
        
        // Strategy 1: look for semester pattern near the table
        const semPattern = /\\b(Fall|Spring|Summer)\\s+\\d{4}\\b/i;
        
        // Check portlet head text
        let container = table.closest('.m-portlet, .m-portlet--mobile, [class*="portlet"]');
        if (container) {
            const allText = container.querySelector(
                '.m-portlet__head-text, .m-portlet__head-title, h2, h3, h4, th'
            );
            if (allText) {
                const raw = allText.innerText || allText.textContent || '';
                const m = raw.match(semPattern);
                if (m) semName = m[0];
                else semName = raw.split(/Cr\\.?\\s*Att/i)[0].trim().split('\\n')[0].trim();
            }
        }
        
        // Strategy 2: scan all preceding siblings/headings for a semester pattern
        if (!semName) {
            let el = table;
            while (el && el !== document.body) {
                el = el.parentElement;
                const text = el ? (el.innerText || el.textContent || '') : '';
                const m = text.match(semPattern);
                if (m) { semName = m[0]; break; }
            }
        }
        
        // Strategy 3: look for any element on the page with a semester pattern above this table
        if (!semName) {
            const allEls = document.querySelectorAll('h2, h3, h4, th, .m-portlet__head-text, .semester-title');
            allEls.forEach(el => {
                if (!semName) {
                    const m = (el.innerText || el.textContent || '').match(semPattern);
                    if (m) semName = m[0];
                }
            });
        }
        
        if (!semName) semName = 'Semester ' + (semesters.length + 1);`;

if (rt.includes(oldSemName)) {
    rt = rt.replace(oldSemName, newSemName);
    fs.writeFileSync('runTranscript.js', rt);
    console.log('[OK] runTranscript.js patched — semester name extraction improved');
} else {
    console.log('[MISS] runTranscript.js: could not find target. Showing current content:');
    // Try a looser match
    const idx = rt.indexOf('Find semester name');
    if (idx !== -1) {
        console.log(rt.substring(idx - 10, idx + 600));
    }
}

// ── 2. FIX content.js — heading should say semester name, not "Transcript Dashboard" ──
let js = fs.readFileSync('content.js', 'utf8');

// The main header just says "Transcript Dashboard" — that's fine as a page title.
// The SEM HEADER inside the card should already show sem.name from the innerHTML.
// The TABS should also show sem.name. Let's verify by checking what the tab innerHTML looks like.
const tabPattern = /tab\.innerHTML = `<span class="ff-tab-code">\$\{sem\.name\}<\/span>`/;
if (tabPattern.test(js)) {
    console.log('[OK] content.js tabs already use sem.name — issue is in runTranscript.js name extraction');
} else {
    console.log('[CHECK] Tab innerHTML differs from expected');
}

// ── 3. FIX styles.css — ensure ff-semester-card padding is actually overridden ──
let css = fs.readFileSync('styles.css', 'utf8');

// The base .ff-semester-card has padding: 24px — ff-transcript-card should override it
// Check if .ff-transcript-card exists and has correct padding
if (css.includes('padding: 36px 42px')) {
    console.log('[OK] styles.css padding already set to 36px 42px');
} else {
    // Force update
    css = css.replace(/\.ff-transcript-card \{[^}]*\}/, '.ff-transcript-card {\n    padding: 36px 42px !important;\n}');
    fs.writeFileSync('styles.css', css);
    console.log('[OK] styles.css padding forced with !important');
}

// Make sure ff-transcript-card appears AFTER ff-semester-card in CSS (specificity)
const semCardIdx = css.indexOf('.ff-semester-card');
const transcriptCardIdx = css.indexOf('.ff-transcript-card');
if (semCardIdx > transcriptCardIdx) {
    console.log('[WARN] .ff-transcript-card appears before .ff-semester-card — adding !important to padding');
    css = css.replace('padding: 36px 42px;', 'padding: 36px 42px !important;');
    fs.writeFileSync('styles.css', css);
}
