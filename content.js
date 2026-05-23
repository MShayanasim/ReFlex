// content.js — ReFlex dashboard renderer + topbar controls
// Depends on: ff-observer.js (ffDiffAndSave), runMarks.js (runMarks), runTranscript.js (runTranscript)

(function() {
    'use strict';
    // ══════════════════════════════════════════════════════════════════════════
    // 1. STATE INIT — Apply persisted theme & UI preference before any render
    // ══════════════════════════════════════════════════════════════════════════

    let ffUIEnabled = true; // Default: ReFlex UI on
    let _outsideClickHandler = null; // Hoisted ref for drawer outside-click listener

(function initState() {
    try {
        chrome.storage.sync.get(['ffTheme', 'flexUiEnabled'], data => {
            if (chrome.runtime.lastError) {
                console.warn('ReFlex: Could not load settings.', chrome.runtime.lastError.message);
                return;
            }
            // Theme — apply immediately to avoid flash
            if (data.ffTheme === 'dark') {
                document.documentElement.classList.add('ff-dark');
            } else {
                document.documentElement.classList.remove('ff-dark');
            }
            // UI enabled state
            ffUIEnabled = data.flexUiEnabled !== false;
            // Apply sidebar class so CSS selectors work
            if (ffUIEnabled) {
                document.documentElement.classList.add('ff-enabled');
            } else {
                document.documentElement.classList.remove('ff-enabled');
            }
        });
    } catch (e) {
        console.warn('ReFlex: Extension context invalidated. Please refresh the page.');
    }
})();

// ══════════════════════════════════════════════════════════════════════════
// 2. TOPBAR TOGGLE — UI switch + dark/light theme switch injected into nav
// ══════════════════════════════════════════════════════════════════════════

function ffInjectTopbarToggle() {
    if (document.getElementById('ff-topbar-controls')) return;

    // Try multiple topbar nav selectors in priority order
    const nav = document.querySelector(
        '.m-topbar__nav.m-nav,' +
        '.m-topbar .m-nav,' +
        '#m_header_topbar .m-nav,' +
        '.m-topbar__nav'
    );
    
    if (!nav) {
        // Retry if not found (SPA might still be rendering)
        if (!window.ffTopbarRetry) {
            let retryCount = 0;
            window.ffTopbarRetry = setInterval(() => {
                retryCount++;
                if (retryCount > 30) { // 15 seconds max
                    clearInterval(window.ffTopbarRetry);
                    window.ffTopbarRetry = null;
                    return;
                }
                if (document.getElementById('ff-topbar-controls')) {
                    clearInterval(window.ffTopbarRetry);
                    window.ffTopbarRetry = null;
                } else if (document.querySelector('.m-topbar__nav.m-nav, .m-topbar .m-nav, #m_header_topbar .m-nav, .m-topbar__nav')) {
                    clearInterval(window.ffTopbarRetry);
                    window.ffTopbarRetry = null;
                    ffInjectTopbarToggle();
                }
            }, 500);
        }
        return;
    }

    const wrapper = document.createElement('li');
    wrapper.id = 'ff-topbar-controls';
    wrapper.style.cssText = [
        'display:flex', 'align-items:center', 'gap:8px',
        'padding:0 10px', 'list-style:none'
    ].join(';');

    // ── UI Toggle (ReFlex on / Original off) ────────────────────────────
    const sw = document.createElement('div');
    sw.className = 'ff-switch' + (ffUIEnabled ? ' on' : '');
    sw.title = ffUIEnabled ? 'Switch to Original UI' : 'Switch to ReFlex UI';
    const iconUrl = chrome.runtime.getURL('reflex-icon-24.png');
    sw.innerHTML = `<div class="ff-switch-thumb"><img src="${iconUrl}" width="10" height="10" alt="R"></div>`;
    sw.addEventListener('click', () => {
        ffUIEnabled = !ffUIEnabled;
        sw.classList.toggle('on', ffUIEnabled);
        sw.title = ffUIEnabled ? 'Switch to Original UI' : 'Switch to ReFlex UI';
        
        // ONLY the storage call goes in the try-catch
        try {
            chrome.storage.sync.set({ flexUiEnabled: ffUIEnabled }, () => {
                if (chrome.runtime.lastError) { /* ignore */ }
            });
        } catch (e) {
            console.warn('ReFlex: Could not save UI state (Extension context invalidated). Please refresh the page.');
        }
        if (!ffUIEnabled) {
            // Show original UI: remove our root, reveal hidden native elements
            document.getElementById('ff-root')?.remove();
            document.documentElement.classList.remove('ff-veil-native');
            document.querySelectorAll('[data-ff-hidden]').forEach(el => {
                el.style.display = '';
                delete el.dataset.ffHidden;
            });
        } else {
            // Restore ReFlex UI: re-run the appropriate renderer
            const url = location.href.toLowerCase();
            if (url.includes('marks'))      window.ffRunMarks      && window.ffRunMarks();
            else if (url.includes('transcript')) window.ffRunTranscript && window.ffRunTranscript();
        }
    });

    // ── Theme Toggle (☀️ / 🌙) ───────────────────────────────────────────
    const isDark = document.documentElement.classList.contains('ff-dark');
    const themeBtn = document.createElement('div');
    themeBtn.className = 'ff-theme-switch' + (isDark ? ' dark' : '');
    themeBtn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    themeBtn.innerHTML = `<span class="ff-theme-icon">${isDark ? '☀️' : '🌙'}</span>`;
        themeBtn.addEventListener('click', () => {
        const nowDark = document.documentElement.classList.toggle('ff-dark');
        themeBtn.classList.toggle('dark', nowDark);
        themeBtn.querySelector('.ff-theme-icon').textContent = nowDark ? '☀️' : '🌙';
        themeBtn.title = nowDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        
        // ONLY the storage call goes in the try-catch
        try {
            chrome.storage.sync.set({ ffTheme: nowDark ? 'dark' : 'light' }, () => {
                if (chrome.runtime.lastError) { /* ignore */ }
            });
        } catch (e) {
            console.warn('ReFlex: Could not save theme state (Extension context invalidated). Please refresh the page.');
        }
    });


    wrapper.appendChild(sw);
    wrapper.appendChild(themeBtn);
    nav.prepend(wrapper);
}
window.ffInjectTopbarToggle = ffInjectTopbarToggle;

// ══════════════════════════════════════════════════════════════════════════
// 3. SHARED HELPERS
// ══════════════════════════════════════════════════════════════════════════

// HTML escape helper — prevents XSS from DOM-sourced strings
const _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(str) {
    return String(str).replace(/[&<>"']/g, c => _ESC_MAP[c]);
}

// Stable ID helper — strips characters invalid in HTML id attributes
function safeId(str) {
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Grade → colour map
const GRADE_COLOURS = {
    'A+': { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  text: '#065f46' },
    'A':  { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  text: '#065f46' },
    'A-': { bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.3)',  text: '#064e3b' },
    'B+': { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  text: '#1e40af' },
    'B':  { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  text: '#1e40af' },
    'B-': { bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.3)',  text: '#3730a3' },
    'C+': { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  text: '#92400e' },
    'C':  { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  text: '#92400e' },
    'C-': { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  text: '#92400e' },
    'D+': { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   text: '#991b1b' },
    'D':  { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   text: '#991b1b' },
    'F':  { bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.4)',   text: '#7f1d1d' },
    'I':  { bg: 'rgba(156,163,175,0.15)', border: 'rgba(156,163,175,0.3)', text: '#4b5563' },
    'W':  { bg: 'rgba(156,163,175,0.15)', border: 'rgba(156,163,175,0.3)', text: '#4b5563' },
};
function gradeStyle(grade) {
    const g = (grade || '').toUpperCase().trim();
    return GRADE_COLOURS[g] || { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.25)', text: '#475569' };
}

// GPA tiers (for projection)
const GPA_TIERS = [
    { label: 'A+',  gpa: 4.00, pct: 90 },
    { label: 'A',   gpa: 4.00, pct: 86 },
    { label: 'A-',  gpa: 3.67, pct: 82 },
    { label: 'B+',  gpa: 3.33, pct: 78 },
    { label: 'B',   gpa: 3.00, pct: 74 },
    { label: 'B-',  gpa: 2.67, pct: 70 },
    { label: 'C+',  gpa: 2.33, pct: 66 },
    { label: 'C',   gpa: 2.00, pct: 62 },
    { label: 'C-',  gpa: 1.67, pct: 58 },
    { label: 'D+',  gpa: 1.33, pct: 54 },
    { label: 'D',   gpa: 1.00, pct: 50 },
    { label: 'F',   gpa: 0.00, pct: 0  },
];
function pctToGrade(pct) {
    return GPA_TIERS.find(t => pct >= t.pct) || GPA_TIERS[GPA_TIERS.length - 1];
}

function mountRoot() {
    let root = document.getElementById('ff-root');
    if (root) root.remove();
    root = document.createElement('div');
    root.id = 'ff-root';
    const content = document.querySelector('.m-content, #m-content, .m-body');
    if (content) content.prepend(root);
    else document.body.appendChild(root);
    return root;
}

function hideNative() {
    document.querySelectorAll('.m-portlet, .m-subheader').forEach(el => {
        if (!el.closest('#ff-root')) {
            el.dataset.ffHidden = '1';
            el.style.display = 'none';
        }
    });
}

// Credit-hour cache for attendance fallback
const _crCache = {};
window.ffGetCreditHours = (code) => _crCache[code] ?? null;

// ══════════════════════════════════════════════════════════════════════════
// 4. MARKS DASHBOARD
// ══════════════════════════════════════════════════════════════════════════

function renderMarksDashboard(marksData, changedKeys) {
    if (!ffUIEnabled) return;
    hideNative();

    const root = mountRoot();

    // ─ Recent Updates Drawer ──────────────────────────────────────────
    const recentUpdates = [];
    marksData.forEach((course, courseIdx) => {
        const codeMatch = course.courseName.match(/^([A-Z]{2,4}\d{4})/i);
        const courseCode = codeMatch ? codeMatch[1] : course.courseName.substring(0, 7);

        course.categories.forEach(cat => {
            cat.items.forEach(item => {
                const courseKey = `${course.courseName}||${cat.name}||${item.label}`;
                if (changedKeys && changedKeys.has(courseKey + '|NEW')) {
                    recentUpdates.push({ courseCode, courseIdx, fullCourseName: course.courseName, catName: cat.name, item, type: 'NEW' });
                } else if (changedKeys && changedKeys.has(courseKey + '|UPDATED')) {
                    recentUpdates.push({ courseCode, courseIdx, fullCourseName: course.courseName, catName: cat.name, item, type: 'UPDATED' });
                }
            });
        });
    });

    const drawer = document.createElement('div');
    drawer.className = 'ff-updates-drawer';
    
    let updatesHtml = '';
    if (recentUpdates.length > 0) {
        recentUpdates.forEach(upd => {
            const badgeClass = upd.type === 'NEW' ? 'ff-badge-new' : 'ff-badge-upd';
            const obtainedStr = (upd.item.obtained !== null && upd.item.obtained !== undefined) ? upd.item.obtained : '-';
            let itemName = upd.item.label;
            if (!isNaN(itemName) || itemName.length <= 2) {
                itemName = upd.catName + ' #' + itemName;
            }
            
            updatesHtml += `
                <div class="ff-updates-drawer-row" data-course-idx="${upd.courseIdx}" data-cat-name="${esc(upd.catName)}" data-item-label="${esc(upd.item.label)}">
                    <div class="ff-updates-drawer-row-left">
                        <span class="ff-updates-drawer-row-course">${esc(upd.courseCode)}</span>
                        <span class="ff-updates-drawer-row-item">${esc(itemName)} (${esc(upd.catName)})</span>
                    </div>
                    <div class="ff-updates-drawer-row-right">
                        <span class="ff-updates-drawer-row-score">${obtainedStr} / ${upd.item.total}</span>
                        <span class="${badgeClass}">${upd.type}</span>
                    </div>
                </div>
            `;
        });
    } else {
        updatesHtml = `
            <div class="ff-updates-empty">
                <span style="font-size: 1.6rem;">🎉</span>
                <span>No new updates. All your grades are up-to-date!</span>
            </div>
        `;
    }

    const tabText = recentUpdates.length > 0 
        ? `${recentUpdates.length} Update${recentUpdates.length > 1 ? 's' : ''}`
        : 'No Updates';

    drawer.innerHTML = `
        <div class="ff-updates-drawer-content">
            <h4>🔔 Recent Updates</h4>
            <div class="ff-updates-list">
                ${updatesHtml}
            </div>
        </div>
        <div class="ff-updates-pull-tab">
            <span class="ff-pull-tab-icon">🔔</span>
            <span class="ff-pull-tab-text">${tabText}</span>
            <span class="ff-pull-tab-arrow">▼</span>
        </div>
    `;

    root.appendChild(drawer);

    // Toggle drawer open/close
    const pullTab = drawer.querySelector('.ff-updates-pull-tab');
    pullTab.addEventListener('click', (e) => {
        e.stopPropagation();
        drawer.classList.toggle('open');
    });

    // Click outside closes drawer
    if (_outsideClickHandler) document.removeEventListener('click', _outsideClickHandler);
    _outsideClickHandler = (e) => {
        if (!drawer.contains(e.target) && drawer.classList.contains('open')) {
            drawer.classList.remove('open');
        }
    };
    document.addEventListener('click', _outsideClickHandler);

    if (recentUpdates.length > 0) {
        // Click on update row handles navigation
        drawer.querySelectorAll('.ff-updates-drawer-row').forEach(row => {
            row.addEventListener('click', () => {
                const cIdx = parseInt(row.getAttribute('data-course-idx'));
                const catName = row.getAttribute('data-cat-name');
                const itemLabel = row.getAttribute('data-item-label');

                // 1. Switch tab
                const tabs = root.querySelectorAll('.ff-course-tabs .ff-tab');
                if (tabs[cIdx]) {
                    tabs[cIdx].click();
                }

                // 2. Scroll and highlight
                setTimeout(() => {
                    const targetId = `item-${cIdx}-${safeId(catName)}-${safeId(itemLabel)}`;
                    const targetRow = document.getElementById(targetId);
                    if (targetRow) {
                        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        targetRow.classList.add('ff-pulse-highlight');
                        setTimeout(() => {
                            targetRow.classList.remove('ff-pulse-highlight');
                        }, 2500);
                    }
                }, 150);

                // 3. Close drawer
                drawer.classList.remove('open');
            });
        });
    }

    // ─ Header ─────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'ff-header';
    header.innerHTML = `<h2>📊 Marks</h2>`;
    root.appendChild(header);

    // ─ Course tabs ────────────────────────────────────────────────────
    const tabBar = document.createElement('div');
    tabBar.className = 'ff-course-tabs';
    header.appendChild(tabBar);

    let activeCourse = 0;
    const panels = [];

    marksData.forEach((course, idx) => {
        // Parse code and short name from full course title
        const codeMatch = course.courseName.match(/^([A-Z]{2,4}\d{4})/i);
        const code = codeMatch ? codeMatch[1] : course.courseName.substring(0, 7);
        // Strip code prefix and section suffix for display
        const displayName = course.courseName
            .replace(/^[A-Z]{2,4}\d{4}-?\s*/i, '')
            .replace(/\s*\(.*\)$/, '')
            .trim();

        // Compute overall score for this course
        let totalObtained = 0, totalWeight = 0;
        course.categories.forEach(cat => {
            cat.items.forEach(item => {
                if (item.obtained !== null && item.obtained !== undefined) {
                    const contrib = item.weight > 0 ? (item.obtained / item.total) * item.weight : 0;
                    totalObtained += contrib;
                    totalWeight += item.weight;
                }
            });
        });
        const overallPct = totalWeight > 0 ? (totalObtained / totalWeight * 100) : 0;
        const tier = pctToGrade(overallPct);

        const tab = document.createElement('div');
        tab.className = 'ff-tab' + (idx === 0 ? ' active' : '');
        tab.innerHTML = `
            <span class="ff-tab-code">${esc(code)}</span>
            <span class="ff-tab-name">${esc(displayName)}</span>
        `;
        tab.addEventListener('click', () => {
            tabBar.querySelectorAll('.ff-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            panels.forEach((p, i) => p.style.display = i === idx ? '' : 'none');
            activeCourse = idx;
        });
        tabBar.appendChild(tab);

        // ─ Panel for this course ─────────────────────────────────────
        const panel = document.createElement('div');
        panel.style.display = idx === 0 ? '' : 'none';
        root.appendChild(panel);
        panels.push(panel);

        // Build overall progress card
        const overallCard = document.createElement('div');
        overallCard.className = 'ff-progress-card';
        overallCard.style.marginTop = '24px';

        // Compute class average across all items
        let totalAvgObtained = 0;
        // Compute key stats
        let gradedWeight = 0; // weight of items that have actually been scored
        let avgGradedWeight = 0; // weight of items that have average
        course.categories.forEach(cat => {
            cat.items.forEach(item => {
                if (item.weight > 0 && item.total > 0 && item.obtained !== null && item.obtained !== undefined) {
                    gradedWeight += item.weight;
                }
                if (item.weight > 0 && item.total > 0 && item.avg !== null && item.avg !== undefined) {
                    totalAvgObtained += (item.avg / item.total) * item.weight;
                    avgGradedWeight += item.weight;
                }
            });
        });
        const ungradedWeight = Math.max(0, 100 - gradedWeight);

        const classAvgPct = avgGradedWeight > 0 ? (totalAvgObtained / avgGradedWeight * 100) : 0;
        const tierGpa = tier.gpa.toFixed(2);
        const gs = gradeStyle(tier.label);

        overallCard.innerHTML = `
            <h3 style="margin-top: 0; margin-bottom: 16px; font-size: 1.4rem; font-weight: 600;">${esc(displayName)}</h3>
            <div class="ff-oa-label">OVERALL PERFORMANCE</div>
            <div class="ff-big-score-row">
                <div class="ff-big-score">
                    ${overallPct.toFixed(2)}%
                    <span class="ff-gpa-badge" style="background:${gs.bg};border-color:${gs.border};color:${gs.text}">
                        ${tier.label} &nbsp;&middot;&nbsp; ${tierGpa} GPA
                    </span>
                </div>
                ${classAvgPct > 0 ? `
                <div class="ff-right-avg-text">
                    Class Average<br>
                    <strong>${classAvgPct.toFixed(2)}%</strong>
                </div>` : ''}
            </div>
            <div class="ff-bar-wrapper">
                <div class="ff-bar-track">
                    <div class="ff-bar-fill" style="width:0%" data-pct="${Math.min(overallPct,100).toFixed(1)}"></div>
                    <div class="ff-ptr ff-ptr-me" style="left:${Math.min(overallPct,100).toFixed(1)}%">
                        <span class="ff-ptr-label-me">&#9660; ${overallPct.toFixed(2)}%</span>
                        <div class="ff-ptr-line-me"></div>
                    </div>
                    ${classAvgPct > 0 ? `
                    <div class="ff-ptr ff-ptr-avg" style="left:${Math.min(classAvgPct,100).toFixed(1)}%">
                        <div class="ff-ptr-line-avg"></div>
                        <span class="ff-ptr-label">Class Avg ${classAvgPct.toFixed(2)}%</span>
                    </div>` : ''}
                </div>
            </div>
            <div class="ff-stats-row">
                <span>Graded to Date: <strong>${totalObtained.toFixed(2)} / ${gradedWeight.toFixed(2)} wt</strong></span>
                ${classAvgPct > 0 ? `<span>Class Average: <strong>${totalAvgObtained.toFixed(2)} / ${avgGradedWeight.toFixed(2)} wt</strong></span>` : ''}
            </div>

        `;

        // GPA projection row
        const gpaRow = buildGpaProjectionRow(overallPct, gradedWeight, ungradedWeight);
        overallCard.appendChild(gpaRow);
        panel.appendChild(overallCard);

        // Animate the bar fill
        requestAnimationFrame(() => {
            overallCard.querySelectorAll('.ff-bar-fill[data-pct]').forEach(bar => {
                setTimeout(() => { bar.style.width = bar.dataset.pct + '%'; }, 80);
            });
        });

        // ─ Category cards grid ───────────────────────────────────────
        const grid = document.createElement('div');
        grid.className = 'ff-cards-grid';
        panel.appendChild(grid);

        course.categories.forEach(cat => {
            if (!cat.items || cat.items.length === 0) return;

            let catObtained = 0, catTotal = 0, catWeight = 0;
            let catAvgObtained = 0, catAvgTotal = 0, catAvgWeight = 0;
            let catTotalWeight = 0;
            let comparableObtained = 0, comparableAvg = 0;
            let catWtObtained = 0;
            let catAvgWtObtained = 0;
            let hasAvg = false;

            cat.items.forEach(item => {
                catTotalWeight += item.weight;
                if (item.obtained !== null && item.obtained !== undefined) {
                    catObtained += item.obtained;
                    catTotal    += item.total;
                    catWeight   += item.weight;
                    if (item.total > 0) {
                        catWtObtained += (item.obtained / item.total) * item.weight;
                    }
                }
                if (item.avg !== null && item.avg !== undefined) {
                    catAvgObtained += item.avg;
                    catAvgTotal    += item.total;
                    catAvgWeight   += item.weight;
                    if (item.total > 0) {
                        catAvgWtObtained += (item.avg / item.total) * item.weight;
                    }
                    hasAvg = true;
                }
                if (item.obtained !== null && item.obtained !== undefined && item.avg !== null && item.avg !== undefined) {
                    comparableObtained += item.obtained;
                    comparableAvg += item.avg;
                }
            });
            const catPct = catTotal > 0 ? (catObtained / catTotal * 100) : 0;
            const catAvgPct = (hasAvg && catAvgTotal > 0) ? (catAvgObtained / catAvgTotal * 100) : 0;
            const isBelow = hasAvg && catPct < catAvgPct;

            const catDiff = hasAvg ? (comparableObtained - comparableAvg) : null;
            const diffSign = catDiff !== null ? (catDiff >= 0 ? '+' : '') : '';
            const diffColor = catDiff !== null ? (catDiff >= 0 ? '#16a34a' : '#dc2626') : '';

            const card = document.createElement('div');
            card.className = 'ff-card' + (isBelow ? ' ff-alert' : '');

            card.innerHTML = `
                <div class="ff-card-top-row">
                    <span style="font-size:0.78rem;font-weight:600;color:#94a3b8;">${catTotalWeight.toFixed(1)}% of overall</span>
                    ${catDiff !== null ? `<span style="font-size:0.85rem;font-weight:700;color:${diffColor};background:${catDiff>=0?'rgba(22,163,74,0.1)':'rgba(220,38,38,0.1)'};padding:3px 10px;border-radius:20px;">${diffSign}${catDiff.toFixed(2)}</span>` : ''}
                </div>
                <p class="ff-cat-title">${esc(cat.name)}</p>
                <div class="ff-card-scores">
                    <div class="ff-score-col ff-my-score-col" style="cursor:pointer; user-select:none;" title="Click to toggle between marks and weightage">
                        <span class="ff-score-label">MY SCORE</span>
                        <span class="ff-score ff-my-score-val" style="transition: opacity 0.15s ease-in-out;">${catObtained.toFixed(2)} / ${catTotal.toFixed(2)}</span>
                    </div>
                    ${hasAvg ? `
                    <div class="ff-score-col right ff-avg-score-col" style="cursor:pointer; user-select:none;" title="Click to toggle between marks and weightage">
                        <span class="ff-score-label">CLASS AVG</span>
                        <span class="ff-score-avg ff-avg-score-val" style="transition: opacity 0.15s ease-in-out;">${catAvgObtained.toFixed(2)} / ${catAvgTotal.toFixed(2)}</span>
                    </div>` : ''}
                </div>
            `;

            let showMyWeightage = false;
            const myScoreCol = card.querySelector('.ff-my-score-col');
            const myScoreVal = card.querySelector('.ff-my-score-val');
            if (myScoreCol && myScoreVal) {
                myScoreCol.addEventListener('click', () => {
                    myScoreVal.style.opacity = '0';
                    setTimeout(() => {
                        showMyWeightage = !showMyWeightage;
                        myScoreVal.textContent = showMyWeightage 
                            ? `${catWtObtained.toFixed(2)} / ${catWeight.toFixed(1)} wt` 
                            : `${catObtained.toFixed(2)} / ${catTotal.toFixed(2)}`;
                        myScoreVal.style.opacity = '1';
                    }, 150);
                });
            }

            if (hasAvg) {
                let showAvgWeightage = false;
                const avgScoreCol = card.querySelector('.ff-avg-score-col');
                const avgScoreVal = card.querySelector('.ff-avg-score-val');
                if (avgScoreCol && avgScoreVal) {
                    avgScoreCol.addEventListener('click', () => {
                        avgScoreVal.style.opacity = '0';
                        setTimeout(() => {
                            showAvgWeightage = !showAvgWeightage;
                            avgScoreVal.textContent = showAvgWeightage 
                                ? `${catAvgWtObtained.toFixed(2)} / ${catAvgWeight.toFixed(1)} wt` 
                                : `${catAvgObtained.toFixed(2)} / ${catAvgTotal.toFixed(2)}`;
                            avgScoreVal.style.opacity = '1';
                        }, 150);
                    });
                }
            }

            // Item rows
            const itemsTable = document.createElement('div');
            itemsTable.className = 'ff-items-table';

            cat.items.forEach(item => {
                const obtainedStr = (item.obtained !== null && item.obtained !== undefined) ? item.obtained : '-';
                const itemPct = (item.total > 0 && item.obtained !== null && item.obtained !== undefined) ? (item.obtained / item.total * 100) : 0;
                const avgPct  = (item.avg !== null && item.avg !== undefined && item.total > 0) ? (item.avg / item.total * 100) : null;
                const isItemBelow = avgPct !== null && item.obtained !== null && item.obtained !== undefined && itemPct < avgPct;

                // Change detection badges
                const courseKey = `${course.courseName}||${cat.name}||${item.label}`;
                let badge = '';
                if (changedKeys && changedKeys.has(courseKey + '|NEW'))     badge = '<span class="ff-badge-new">NEW</span>';
                if (changedKeys && changedKeys.has(courseKey + '|UPDATED')) badge = '<span class="ff-badge-upd">UPD</span>';

                const minMaxHtml = (item.min !== null && item.max !== null)
                    ? `<span class="ff-item-minmax">Min ${esc(String(item.min))} | Max ${esc(String(item.max))}</span>` : '';

                const row = document.createElement('div');
                row.id = `item-${idx}-${safeId(cat.name)}-${safeId(item.label)}`;
                row.className = 'ff-item-row' + (isItemBelow ? ' ff-item-below' : '');
                let itemName = item.label;
                if (!isNaN(itemName) || itemName.length <= 2) {
                    itemName = cat.name + ' #' + itemName;
                }

                row.innerHTML = `
                    <span class="ff-item-label" style="display: flex; align-items: center; flex: 1; min-width: 120px;">
                        ${isItemBelow ? '<i class="ff-warn-icon">!</i>' : ''}
                        ${badge}${esc(itemName)}
                    </span>
                    <span class="ff-item-weightage" title="Contributes ${item.weight}% to final grade" style="flex: 0 0 35px; text-align: center;">${item.weight}%</span>
                    <span class="ff-item-val" style="flex: 0 0 65px; text-align: right;">${obtainedStr} / ${item.total}</span>
                    <span class="ff-item-avg" style="flex: 0 0 55px; text-align: right;">${item.avg !== null && item.avg !== undefined ? `avg ${item.avg.toFixed ? item.avg.toFixed(1) : item.avg}` : ''}</span>
                    <span style="flex: 0 0 100px; text-align: right;">${minMaxHtml}</span>
                `;
                itemsTable.appendChild(row);
            });

            card.appendChild(itemsTable);
            grid.appendChild(card);
        });
    });

    // Expose credit-hour lookup for attendance module
    marksData.forEach(course => {
        const codeMatch = course.courseName.match(/^([A-Z]{2,4}\d{4})/i);
        if (codeMatch) {
            let hrs = 3;
            const lower = course.courseName.toLowerCase();
            if (lower.includes(' lab') || /^(cl|el|sl)\d/i.test(course.courseName)) hrs = 1;
            else if (/^ss\d/i.test(course.courseName)) hrs = 2;
            _crCache[codeMatch[1].toUpperCase()] = hrs;
        }
    });
}
window.ffRunMarks = () => { if (typeof runMarks === 'function') runMarks(); };

// ── GPA Projection Row ──────────────────────────────────────────────────
function buildGpaProjectionRow(currentPct, gradedWeight, ungradedWeight) {
    const row = document.createElement('div');
    row.className = 'ff-gpa-row';

    const label = document.createElement('span');
    label.className = 'ff-gpa-label';
    label.textContent = 'TARGET GRADE';
    row.appendChild(label);

    // Tier dropdown
    const sel = document.createElement('select');
    sel.className = 'ff-tier-sel';
    const availableTiers = GPA_TIERS.filter(t => t.gpa >= 2.0);
    availableTiers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.pct;
        opt.textContent = `${t.label} (${t.gpa.toFixed(2)})`;
        sel.appendChild(opt);
    });
    row.appendChild(sel);

    const result = document.createElement('span');
    row.appendChild(result);

    let showWeightage = false;
    result.style.cursor = 'pointer';
    result.title = 'Click to toggle between percentage and weightage';
    result.addEventListener('click', () => {
        showWeightage = !showWeightage;
        update();
    });

    function update() {
        const target = parseFloat(sel.value);
        const currentContrib = currentPct * (gradedWeight / 100);
        
        if (currentContrib >= target) {
            result.className = 'ff-gpa-top';
            result.textContent = 'Already achieved!';
        } else if (ungradedWeight <= 0) {
            result.className = 'ff-gpa-impossible';
            result.textContent = 'No remaining weight';
        } else {
            const neededWeight = target - currentContrib;
            const neededOnRemaining = (neededWeight / ungradedWeight) * 100;
            const tierObj = GPA_TIERS.find(t=>t.pct===target);
            const suffix = tierObj ? ` → ${tierObj.label} (${tierObj.gpa.toFixed(2)})` : '';

            if (neededOnRemaining > 100) {
                result.className = 'ff-gpa-impossible';
                if (showWeightage) {
                    result.textContent = `Impossible (need ${neededWeight.toFixed(2)} weight on remaining ${ungradedWeight.toFixed(2)} weight)${suffix}`;
                } else {
                    result.textContent = `Impossible (need ${neededOnRemaining.toFixed(1)}% on remaining ${ungradedWeight.toFixed(1)}%)${suffix}`;
                }
            } else {
                result.className = 'ff-gpa-next';
                if (showWeightage) {
                    result.textContent = `Need ${neededWeight.toFixed(2)} weight on remaining ${ungradedWeight.toFixed(2)} weight${suffix}`;
                } else {
                    result.textContent = `Need ${neededOnRemaining.toFixed(1)}% on remaining ${ungradedWeight.toFixed(1)}%${suffix}`;
                }
            }
        }
    }
    sel.addEventListener('change', update);
    // Pre-select the tier just above current
    const nextTier = [...availableTiers].reverse().find(t => t.pct > currentPct);
    if (nextTier) sel.value = nextTier.pct;
    else sel.value = availableTiers[0].pct;
    update();
    return row;
}

// ══════════════════════════════════════════════════════════════════════════
// 5. TRANSCRIPT DASHBOARD
// ══════════════════════════════════════════════════════════════════════════

function renderTranscriptDashboard(semesters) {
    if (!ffUIEnabled) return;
    hideNative();

    const root = mountRoot();

    const header = document.createElement('div');
    header.className = 'ff-header';
    header.innerHTML = `<h2>Transcript Dashboard</h2>`;
    root.appendChild(header);

        // Pre-calculate running points and SGPA/CGPA for all semesters
    let runningPoints = 0, runningCrHrs = 0;
    semesters.forEach(sem => {
        let semPoints = 0, semCrHrs = 0;
        sem.courses.forEach(c => {
            const cr = parseFloat(c.crhrs) || 0;
            const pts = parseFloat(c.points) || 0;
            const grade = (c.grade || '').trim().toUpperCase();
            const remarks = (c.remarks || '').trim().toUpperCase();
            const type = (c.type || '').trim().toUpperCase();

            // Ignore incomplete, withdrawn, or non-credit courses
            if (cr > 0 && grade && grade !== '-' && grade !== 'I' && grade !== 'W' && grade !== 'NC' && remarks !== 'NC' && type !== 'NON CREDIT') {
                semPoints += pts * cr;
                semCrHrs  += cr;
                runningPoints += pts * cr;
                runningCrHrs  += cr;
                // Cache credit hours for attendance module
                const codeMatch = c.code.match(/^([A-Z]{2,4}\d{4})/i);
                if (codeMatch) _crCache[codeMatch[1].toUpperCase()] = cr;
            }
        });
        sem.sgpa = semCrHrs > 0 ? (semPoints / semCrHrs).toFixed(2) : '—';
        sem.cgpa = runningCrHrs > 0 ? (runningPoints / runningCrHrs).toFixed(2) : '—';
        sem.semCrHrs = semCrHrs;
    });


    // Create Semester Tabs
    const tabsRow = document.createElement('div');
    tabsRow.className = 'ff-course-tabs';
    tabsRow.style.marginBottom = '24px';
    
    // Create the main card that will hold the courses
    const mainCard = document.createElement('div');
    mainCard.className = 'ff-semester-card ff-transcript-card';
    
    // Function to render a specific semester
    function renderSemester(index) {
        // Update tabs
        Array.from(tabsRow.children).forEach((tab, i) => {
            tab.classList.toggle('active', i === index);
        });
        
        const sem = semesters[index];
        mainCard.innerHTML = `
            <div class="ff-sem-header" style="align-items: center; margin-bottom: 30px; background: transparent !important; width: 100%;">
                <span class="ff-sem-title" style="font-size: 1.4rem;">${esc(sem.name)}</span>
                <div class="ff-sem-rings">
                    <div class="ff-ring" title="Semester GPA">
                        <span>${sem.sgpa}</span><small>SGPA</small>
                    </div>
                    <div class="ff-ring" title="Cumulative GPA so far">
                        <span>${sem.cgpa}</span><small>CGPA</small>
                    </div>
                </div>
            </div>
            <div class="ff-course-list ff-clean-list"></div>
        `;
        
        const courseList = mainCard.querySelector('.ff-course-list');
        
        sem.courses.forEach(c => {
            const gs = gradeStyle(c.grade);
            const cr = parseFloat(c.crhrs) || 0;
            const pts = parseFloat(c.points) || 0;
            
            let weightPct = '';
            let contribPts = '';
            if (cr > 0 && sem.semCrHrs > 0) {
                weightPct = ((cr / sem.semCrHrs) * 100).toFixed(1) + '% of SGPA';
                if (pts > 0) {
                    contribPts = ((pts * cr) / sem.semCrHrs).toFixed(3) + ' pts to SGPA';
                }
            }

            const item = document.createElement('div');
            item.className = 'ff-transcript-row';
            item.innerHTML =
                '<div class="ff-tr-left">' +
                    '<div class="ff-tr-name">' + esc(c.name) + '</div>' +
                    '<div class="ff-tr-meta">' +
                        '<span class="ff-tr-code">' + esc(c.code) + ' • ' + cr + ' Cr</span>' +
                        (weightPct ? '<span class="ff-tr-sep">|</span><span class="ff-tr-weight">Weight: ' + weightPct + '</span>' : '') +
                        (contribPts ? '<span class="ff-tr-sep">|</span><span class="ff-tr-contrib">Contributes ' + contribPts + '</span>' : '') +
                    '</div>' +
                '</div>' +
                '<div class="ff-grade-badge" style="background:' + gs.bg + ';border-color:' + gs.border + ';color:' + gs.text + '">' +
                    esc(c.grade || '—') +
                '</div>';
            courseList.appendChild(item);
        });
    }

    // Build tabs
    semesters.forEach((sem, i) => {
        const tab = document.createElement('div');
        tab.className = 'ff-tab';
        tab.style.flexDirection = 'row';
        tab.style.minWidth = 'auto';
        tab.innerHTML = `<span class="ff-tab-code">${esc(sem.name)}</span>`;
        tab.onclick = () => renderSemester(i);
        tabsRow.appendChild(tab);
    });

    root.appendChild(tabsRow);
    root.appendChild(mainCard);
    
    // Select the last semester by default (most recent)
    if (semesters.length > 0) {
        renderSemester(semesters.length - 1);
    }
}
window.renderMarksDashboard = renderMarksDashboard;
window.renderTranscriptDashboard = renderTranscriptDashboard;
window.ffRunTranscript = () => { if (typeof runTranscript === 'function') runTranscript(); };

    let _watchStarted = false;
    function startWatch() {
        if (_watchStarted || typeof window.ffWatch !== 'function') return;
        _watchStarted = true;
        window.ffWatch();
    }
    if (typeof window.ffWatch === 'function') {
        startWatch();
    } else {
        document.addEventListener('DOMContentLoaded', startWatch);
    }
})();
