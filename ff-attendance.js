// ff-attendance.js — Absent analytics overlay
// Appends a small bar above each attendance table. Never modifies original UI.

(function() {
    'use strict';
    let attTimer    = null;
    let attObserver = null;
    let _attThemeObs = null;
    const _processedTables = new WeakSet();

// ── Entry point called by ff-observer ─────────────────────────────────────
function runAttendance() {
    if (attObserver) { attObserver.disconnect(); attObserver = null; }

    enhanceAttendanceTables();

    // Watch for inner-page tab switches (same URL, new table content)
    const area = document.querySelector('.m-content, #m-content, .m-wrapper') || document.body;
    attObserver = new MutationObserver(() => {
        clearTimeout(attTimer);
        attTimer = setTimeout(() => {
            if (attObserver) attObserver.disconnect();
            enhanceAttendanceTables();
            if (attObserver) attObserver.observe(area, { childList: true, subtree: true });
        }, 400);
    });
    attObserver.observe(area, { childList: true, subtree: true });

    // Re-render bars whenever the user toggles dark/light so colours update live
    if (!_attThemeObs) {
        _attThemeObs = new MutationObserver(() => {
            document.querySelectorAll('.ff-att-bar').forEach(el => el.remove());
            // Unhide any rows that were previously hidden by the "Show Absents Only" filter
            document.querySelectorAll('table tr').forEach(row => row.style.display = '');
            // Clear processed cache so bars are rebuilt with new theme colours
            document.querySelectorAll('table').forEach(t => _processedTables.delete(t));
            enhanceAttendanceTables();
        });
        _attThemeObs.observe(document.documentElement, { attributeFilter: ['class'] });
    }
}

// ── Find & process every attendance table on the visible page ─────────────
function enhanceAttendanceTables() {
    document.querySelectorAll('table').forEach(table => {
        // Skip if already processed
        if (_processedTables.has(table)) return;

        const hCells = Array.from(
            table.querySelectorAll('tr:first-child th, tr:first-child td')
        ).map(c => c.textContent.trim().toLowerCase());

        if (!hCells.some(h => h.includes('presence'))) {
            _processedTables.add(table); // not an attendance table, skip on future scans
            return;
        }

        const presenceIdx = hCells.findIndex(h => h.includes('presence'));
        const durationIdx = hCells.findIndex(h => h.includes('duration'));
        buildBar(table, presenceIdx, durationIdx);
        _processedTables.add(table);
    });
}

// ─ Universal English + Desi student warning message pools ─
const DESI_WARNS = {
    drop: [
        'Drop scenez. You exceeded the allowed offs.',
        'Jeo ustaad. Aur bunk maaro.',
        'Exceeded the {maxAbsents} offs limit. Mubarak ho, repeat confirmed 🤝',
        'Attendance short ho chuki hai. Good luck explaining this to your parents.',
        'Drop it before it drops your GPA.',
        'Limit cross ho chuki hai. Aglay saal milte hain.',
        'Nalaik insaan, {maxAbsents} offs khatam ho chuki hain aur abhi bhi bunk maar rahe ho.'
    ],
    0: [
        'Itni azaadi kisne di thi bhai? Last line pe kharay ho.',
        'You\'ve used all {maxAbsents} offs. Good luck buddy.',
        'Ab wheelchair pe bhi aana pare toh class aao, there\'s literally no margin left.',
        'Subah 8 baje ki neend pyari hai ya repeat ki fee?',
        'Boundary line pe kharay ho, one more bunk and it\'s over.',
        'No more offs allowed. Khuda ka khof karo aur class jao.'
    ],
    1: [
        'Sirf 1 off bacha hai. Chill out on the bunks.',
        'Bhai seedhi baat hai, you only have 1 off left before you\'re on the edge.',
        'One more off and you hit the {maxAbsents} offs limit.',
        'Thora dimagh chala lo, save this last off for an emergency.',
        'Sirf 1 off reh gaya hai out of {maxAbsents}, don\'t waste it.'
    ],
    2: [
        'Sirf 2 offs bache hain, scene tight ho raha hai.',
        'You\'re burning through your offs way too fast.',
        '2 offs left out of {maxAbsents}. Bhai ab thora sambhal jao.',
        'Dhabba baad mein chale jana, attendance bacha lo abhi.'
    ],
    3: [
        'Scene thora off lag raha hai, {absents} offs already ho chuki hain.',
        'Itna chill scene kahan se laate ho bhai? {absents} offs ho chuki hain.',
        '{remaining} left before drop scenez. Don\'t push it.',
        'Classes attend karna shuru kar do abhi se.'
    ]
};

function getWarningMessage(table, absents, warnAt, maxAbsents, forceNew = false) {
    const rawRemaining = maxAbsents - absents;
    const remaining = Math.round(rawRemaining * 10) / 10;
    let tierKey;
    if (remaining < 0) {
        tierKey = 'drop';
    } else if (remaining <= 0) {
        tierKey = 0;
    } else if (remaining <= 1) {
        tierKey = 1;
    } else if (remaining <= 2) {
        tierKey = 2;
    } else {
        tierKey = 3;
    }

    // Return cached message if not forced, same tier, AND absents haven't changed
    if (!forceNew && table._ffCachedWarnKey === tierKey && table._ffCachedAbsents === absents && table._ffCachedWarnMsg) {
        return table._ffCachedWarnMsg;
    }

    const pool = DESI_WARNS[tierKey];
    // Exclude the currently displayed template so re-rolling always produces a new line
    const currentTemplate = table._ffCachedRawTemplate;
    const available = (forceNew && pool.length > 1 && currentTemplate)
        ? pool.filter(t => t !== currentTemplate)
        : pool;
    const candidates = available.length > 0 ? available : pool;
    const rawTemplate = candidates[Math.floor(Math.random() * candidates.length)];
    const remainingStr = remaining === 1 ? '1 off' : `${Math.max(0, remaining)} offs`;

    const finalMsg = rawTemplate
        .replace(/{remaining}/g, remainingStr)
        .replace(/{absents}/g, absents)
        .replace(/{maxAbsents}/g, maxAbsents);

    table._ffCachedWarnKey = tierKey;
    table._ffCachedAbsents = absents;
    table._ffCachedRawTemplate = rawTemplate;
    table._ffCachedWarnMsg = finalMsg;
    return finalMsg;
}

// ── Build and inject the info bar ─────────────────────────────────────────
function buildBar(table, presenceIdx, durationIdx) {
    // ─ detect credit hours from nearby heading ─
    const creditHours = Math.max(1, detectCreditHours(table));
    const maxAbsents  = creditHours * 3;   // 1cr→3h, 2cr→6h, 3cr→9h
    const warnAt      = creditHours * 2;   // 1cr→2h, 2cr→4h, 3cr→6h

    // ─ count absent HOURS (each absent lecture × its duration) ─
    const dataRows = getDataRows(table);
    let absentHours = 0;
    dataRows.forEach(row => {
        const tds = row.querySelectorAll('td');
        const presCell = tds[presenceIdx];
        if (presCell && presCell.textContent.trim().toUpperCase() === 'A') {
            const dur = durationIdx >= 0 ? (parseFloat(tds[durationIdx]?.textContent) || 1) : 1;
            absentHours += dur;
        }
    });

    const absents = absentHours; // alias for readability below
    const danger  = absents >= warnAt;

    // ─ detect current theme ─
    const isDark = document.documentElement.classList.contains('ff-dark');

    // ─ build bar ─
    const bar = document.createElement('div');
    bar.className = 'ff-att-bar';
    bar.style.cssText = [
        'display:flex', 'align-items:center', 'flex-wrap:wrap', 'gap:10px',
        'padding:7px 12px', 'margin-bottom:8px',
        isDark ? 'background:#1e293b' : 'background:#f0f4ff',
        isDark ? 'border:1px solid rgba(255,255,255,0.08)' : 'border:1px solid #c8d6f0',
        'border-radius:5px', 'font-size:0.875rem', 'font-family:inherit'
    ].join(';');

    // ─ Modern Heatmap Tier Color Palette ─
    const remaining = maxAbsents - absents;
    let tierKey;
    if (remaining < 0)       tierKey = 'drop';
    else if (remaining <= 0) tierKey = 0;
    else if (remaining <= 1) tierKey = 1;
    else if (remaining <= 2) tierKey = 2;
    else                     tierKey = 3;

    const TIER_COLORS = {
        drop: { dark: '#f87171', light: '#b91c1c' }, // Deep Velvet Red (Exceeded limit)
        0:    { dark: '#ef4444', light: '#dc2626' }, // Bright Crimson (0 offs left)
        1:    { dark: '#f43f5e', light: '#e11d48' }, // Vivid Rose (1 off left)
        2:    { dark: '#fb923c', light: '#ea580c' }, // Warm Peach / Coral (2 offs left)
        3:    { dark: '#38bdf8', light: '#0284c7' }  // Sky Blue (3+ offs left)
    };

    const activeColor = danger
        ? (isDark ? TIER_COLORS[tierKey].dark : TIER_COLORS[tierKey].light)
        : (isDark ? '#94a3b8' : '#2c3e50');

    // Counter pill
    const counter = document.createElement('span');
    counter.style.cssText = `font-weight:700;color:${activeColor};`;
    counter.textContent = `Absent Hours: ${absents} / ${maxAbsents}h`;

    // Warning message
    const warn = document.createElement('span');
    if (danger) {
        warn.style.cssText = [
            `color:${activeColor}`,
            'font-weight:700',
            'font-style:italic',
            'cursor:pointer',
            'user-select:none',
            'display:inline-block',
            'transition:transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s ease'
        ].join(';');
        warn.title = 'Click to roll';
        warn.textContent = getWarningMessage(table, absents, warnAt, maxAbsents);

        let isRolling = false;
        warn.addEventListener('click', () => {
            if (isRolling) return;
            isRolling = true;
            warn.style.transform = 'scale(0.92)';
            warn.style.opacity = '0.5';
            setTimeout(() => {
                warn.textContent = getWarningMessage(table, absents, warnAt, maxAbsents, true);
                warn.style.transform = 'scale(1)';
                warn.style.opacity = '1';
                setTimeout(() => { isRolling = false; }, 140);
            }, 120);
        });
    }

    // Filter button
    const sortBtn = document.createElement('button');
    sortBtn.textContent = 'Show Absents Only';
    sortBtn.style.cssText = [
        'margin-left:auto', 'padding:4px 13px',
        isDark ? 'background:#3b4fd8' : 'background:#2980b9',
        'color:#fff',
        'border:none', 'border-radius:4px',
        'cursor:pointer', 'font-size:0.8rem', 'font-weight:600'
    ].join(';');

    let filtered = false;
    sortBtn.addEventListener('click', () => {
        const rows = getDataRows(table);
        if (!filtered) {
            rows.forEach(row => {
                const presCell = row.querySelectorAll('td')[presenceIdx];
                const isAbsent = presCell && presCell.textContent.trim().toUpperCase() === 'A';
                row.style.display = isAbsent ? '' : 'none';
            });
            sortBtn.textContent = 'Show All';
            filtered = true;
        } else {
            rows.forEach(row => row.style.display = '');
            sortBtn.textContent = 'Show Absents Only';
            filtered = false;
        }
    });

    bar.appendChild(counter);
    if (danger) bar.appendChild(warn);
    bar.appendChild(sortBtn);

    while (table.previousElementSibling && table.previousElementSibling.classList.contains('ff-att-bar')) {
        table.previousElementSibling.remove();
    }
    table.parentNode.insertBefore(bar, table);
}

// ── Helpers ───────────────────────────────────────────────────────────────
function getDataRows(table) {
    // Returns only data rows (skipping header)
    const tbody = table.querySelector('tbody');
    if (tbody) return Array.from(tbody.querySelectorAll('tr'));
    // No tbody — skip first row (header)
    return Array.from(table.querySelectorAll('tr')).slice(1);
}

function detectCreditHours(table) {
    // Walk up to find a nearby heading with course code
    let heading = '';
    let node = table.parentElement;
    for (let i = 0; i < 6 && node; i++) {
        const h = node.querySelector('h2,h3,h4,h5,h6,[class*="title"],[class*="heading"]');
        if (h) { heading = h.textContent.trim(); break; }
        let sib = node.previousElementSibling;
        for (let j = 0; j < 4 && sib; j++) {
            const txt = sib.textContent?.trim() || '';
            if (/[A-Z]{2,4}\d{4}/.test(txt)) { heading = txt; break; }
            sib = sib.previousElementSibling;
        }
        if (heading) break;
        node = node.parentElement;
    }

    // ── Strategy 1: look up exact credit hours from transcript data ──────
    const courseCode = (heading.match(/([A-Z]{2,4}\d{4})/i) || [])[1];
    if (courseCode && typeof window.ffGetCreditHours === 'function') {
        const fromTranscript = window.ffGetCreditHours(courseCode);
        if (fromTranscript !== null && fromTranscript > 0) return fromTranscript;
    }

    // ── Strategy 2: name-based heuristic (fallback) ──────────────────────
    const text = heading.toLowerCase();
    const code = (heading.match(/^([A-Z]{2,3})\d{4}/i) || [])[1]?.toUpperCase() || '';

    if (['CL','EL','SL'].includes(code) || text.includes(' lab')) return 1;
    if (code === 'SS') return 2;
    return 3;
}

// ── Cleanup (called by ff-observer tearDown) ───────────────────────────────
function tearDownAttendance() {
    if (attObserver) { attObserver.disconnect(); attObserver = null; }
    if (_attThemeObs) { _attThemeObs.disconnect(); _attThemeObs = null; }
    clearTimeout(attTimer);
    document.querySelectorAll('.ff-att-bar').forEach(el => el.remove());
}

    window.ffRunAttendance      = runAttendance;
    window.ffTearDownAttendance = tearDownAttendance;
})();
