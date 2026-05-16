// ff-attendance.js â€” Absent analytics overlay
// Appends a small bar above each attendance table. Never modifies original UI.

let attTimer    = null;
let attObserver = null;

// â”€â”€ Entry point called by ff-observer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function runAttendance() {
    if (attObserver) { attObserver.disconnect(); attObserver = null; }

    enhanceAttendanceTables();

    // Watch for inner-page tab switches (same URL, new table content)
    // Watch for inner-page tab switches (same URL, new table content)
    const area = document.querySelector('.m-content, #m-content, .m-wrapper') || document.body;
    attObserver = new MutationObserver(() => {
        clearTimeout(attTimer);
        attTimer = setTimeout(enhanceAttendanceTables, 400);
    });
    attObserver.observe(area, { childList: true, subtree: true });
}

// â”€â”€ Find & process every attendance table on the visible page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function enhanceAttendanceTables() {
    document.querySelectorAll('table').forEach(table => {
        // Skip if already has our bar
        if (table.previousElementSibling?.classList?.contains('ff-att-bar')) return;

        const hCells = Array.from(
            table.querySelectorAll('tr:first-child th, tr:first-child td')
        ).map(c => c.textContent.trim().toLowerCase());

        if (!hCells.some(h => h.includes('presence'))) return;

        const presenceIdx = hCells.findIndex(h => h.includes('presence'));
        const durationIdx = hCells.findIndex(h => h.includes('duration'));
        buildBar(table, presenceIdx, durationIdx);
    });
}

// â”€â”€ Build and inject the info bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildBar(table, presenceIdx, durationIdx) {
    // â”€ detect credit hours from nearby heading â”€
    const creditHours = detectCreditHours(table);
    const maxAbsents  = creditHours * 3;   // 1crâ†’3h, 2crâ†’6h, 3crâ†’9h
    const warnAt      = creditHours * 2;   // 1crâ†’2h, 2crâ†’4h, 3crâ†’6h

    // â”€ count absent HOURS (each absent lecture Ã— its duration) â”€
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

    // â”€ warning messages â”€
    const WARNS = [
        'Gang you are cooked! ðŸ”¥',
        'Yikes. Talk to your teacher. ðŸ’€',
        'Bro. Please just go to class. ðŸ˜­',
        'At this point just drop it. ðŸ’€'
    ];

    // â”€ detect current theme â”€
    const isDark = document.documentElement.classList.contains('ff-dark');

    // â”€ build bar â”€
    const bar = document.createElement('div');
    bar.className = 'ff-att-bar';
    bar.style.cssText = [
        'display:flex', 'align-items:center', 'flex-wrap:wrap', 'gap:10px',
        'padding:7px 12px', 'margin-bottom:8px',
        isDark ? 'background:#1e293b' : 'background:#f0f4ff',
        isDark ? 'border:1px solid rgba(255,255,255,0.08)' : 'border:1px solid #c8d6f0',
        'border-radius:5px', 'font-size:0.875rem', 'font-family:inherit'
    ].join(';');

    // Counter pill
    const counter = document.createElement('span');
    let counterColor;
    if (danger)    counterColor = isDark ? '#f87171' : '#c0392b';
    else           counterColor = isDark ? '#94a3b8' : '#2c3e50';
    counter.style.cssText = `font-weight:700;color:${counterColor};`;
    counter.textContent = `Absent Hours: ${absents} / ${maxAbsents}h`;

    // Warning message
    const warn = document.createElement('span');
    if (danger) {
        warn.style.cssText = `color:${isDark ? '#f87171' : '#e74c3c'};font-weight:700;font-style:italic;`;
        warn.textContent = WARNS[Math.min(absents - warnAt, WARNS.length - 1)];
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

    table.parentNode.insertBefore(bar, table);
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getDataRows(table) {
    // Returns only data rows (skipping header)
    const tbody = table.querySelector('tbody');
    if (tbody) return Array.from(tbody.querySelectorAll('tr'));
    // No tbody â€” skip first row (header)
    return Array.from(table.querySelectorAll('tr')).slice(1);
}

function detectCreditHours(table) {
    // Walk up to find a nearby heading with course code
    let heading = '';
    let node = table.parentElement;
    for (let i = 0; i < 6 && node; i++) {
        const h = node.querySelector('h2,h3,h4,h5,h6,[class*="title"],[class*="heading"]');
        if (h) { heading = h.textContent.trim(); break; }
        let sib = table.previousElementSibling;
        for (let j = 0; j < 4 && sib; j++) {
            const txt = sib.textContent?.trim() || '';
            if (/[A-Z]{2,4}\d{4}/.test(txt)) { heading = txt; break; }
            sib = sib.previousElementSibling;
        }
        if (heading) break;
        node = node.parentElement;
    }

    // â”€â”€ Strategy 1: look up exact credit hours from transcript data â”€â”€â”€â”€â”€â”€
    const courseCode = (heading.match(/([A-Z]{2,4}\d{4})/i) || [])[1];
    if (courseCode && typeof window.ffGetCreditHours === 'function') {
        const fromTranscript = window.ffGetCreditHours(courseCode);
        if (fromTranscript !== null) return fromTranscript;
    }

    // â”€â”€ Strategy 2: name-based heuristic (fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const text = heading.toLowerCase();
    const code = (heading.match(/^([A-Z]{2,3})\d{4}/i) || [])[1]?.toUpperCase() || '';

    if (['CL','EL','SL'].includes(code) || text.includes(' lab')) return 1;
    if (code === 'SS') return 2;
    return 3;
}

// â”€â”€ Cleanup (called by ff-observer tearDown) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function tearDownAttendance() {
    if (attObserver) { attObserver.disconnect(); attObserver = null; }
    clearTimeout(attTimer);
    document.querySelectorAll('.ff-att-bar').forEach(el => el.remove());
}

window.ffRunAttendance      = runAttendance;
window.ffTearDownAttendance = tearDownAttendance;

// Re-render bars whenever the user toggles dark/light so colours update live
const _attThemeObs = new MutationObserver(() => {
    document.querySelectorAll('.ff-att-bar').forEach(el => el.remove());
    enhanceAttendanceTables();
});
_attThemeObs.observe(document.documentElement, { attributeFilter: ['class'] });


