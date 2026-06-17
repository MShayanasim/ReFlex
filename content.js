// content.js — ReFlex dashboard renderer + topbar controls
// Depends on: ff-observer.js (ffDiffAndSave), runMarks.js (runMarks), runTranscript.js (runTranscript)

(function() {
    'use strict';
    // ══════════════════════════════════════════════════════════════════════════
    // 1. STATE INIT — Apply persisted theme & UI preference before any render
    // ══════════════════════════════════════════════════════════════════════════

    let ffUIEnabled = true; // Default: ReFlex UI on
    let _outsideClickHandler = null; // Hoisted ref for drawer outside-click listener
    let _semDropdownCloseHandler = null; // Hoisted ref for semester dropdown listener

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
                window.dispatchEvent(new CustomEvent('ff-theme-changed', { detail: { isDark: true } }));
            } else {
                document.documentElement.classList.remove('ff-dark');
                window.dispatchEvent(new CustomEvent('ff-theme-changed', { detail: { isDark: false } }));
            }
            // UI enabled state
            ffUIEnabled = data.flexUiEnabled !== false;
            localStorage.setItem('ff_ui_enabled', ffUIEnabled);
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


// Listener for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'REPLAY_TUTORIAL') {
        const url = location.href.toLowerCase();
        if (url.includes('marks') && window.ffRunTutorial) {
            // Reset the state so it doesn't immediately exit
            chrome.storage.local.set({ ff_tutorial_v2_status: 'in_progress' }, () => {
                window.ffRunTutorial();
            });
        }
        sendResponse({ success: true });
    } else if (request.action === 'NEW_MARKS_DATA' || request.action === 'SYNC_COMPLETED') {
        if (request.action === 'SYNC_COMPLETED') {
            const syncBtnSvg = document.querySelector('#ff-sync-marks-btn svg');
            const syncBtn = document.querySelector('#ff-sync-marks-btn');
            if (syncBtnSvg) syncBtnSvg.style.transform = `rotate(${(parseInt(syncBtnSvg.dataset.rot||0) + 0)}deg)`; // Ensure it's static
            if (syncBtn) {
                syncBtn.style.pointerEvents = 'auto';
                syncBtn.style.opacity = '1';
            }
        }
        const url = location.href.toLowerCase();
        if (url.includes('marks')) {
            if (request.semId && request.semId === window._ffCurrentSemesterId && request.marksData) {
                // Background worker sent fresh data for the active semester
                // The raw background fetch lacks the lazy-loaded Grand Totals, so we graft them from the live DOM!
                document.querySelectorAll('tr.GrandtotalColumn').forEach(gtRow => {
                    if (!gtRow.textContent.trim().match(/\d/)) return;
                    const gtContainer = gtRow.closest('[id$="-Grand_Total_Marks"]') || gtRow.closest('table')?.closest('[id$="-Grand_Total_Marks"]');
                    if (gtContainer) {
                        const code = gtContainer.id.split('-')[0].trim();
                        const targetCourse = request.marksData.find(c => c.courseName.includes(code));
                        if (targetCourse) {
                            const tds = Array.from(gtRow.querySelectorAll('td'));
                            const extractVal = (className, idx) => {
                                const el = gtRow.querySelector('.' + className);
                                const text = (el || tds[idx])?.textContent.trim() || '';
                                const match = text.match(/[-+]?[0-9]*\.?[0-9]+/);
                                return match ? parseFloat(match[0]) : null;
                            };
                            targetCourse.grandTotal = {
                                totalMarks: extractVal('GrandtotalColMarks', 0),
                                obtainedMarks: extractVal('GrandtotalObtMarks', 1),
                                classAverage: extractVal('GrandtotalClassAvg', 2),
                                min: extractVal('GrandtotalClassMin', 3),
                                max: extractVal('GrandtotalClassMax', 4),
                                stdDev: extractVal('GrandtotalClassStdDev', 5) || extractVal('GrandtotalClassStd', 5)
                            };
                        }
                    }
                });
                
                // We hot-swap it without reloading the page!
                window._ffBackgroundMarksCache = request.marksData;
            }
            if (window.ffRunMarks) window.ffRunMarks(false);
        }
    }
});

window.ffSyncPoller = null;
function startVisibilityAwarePolling() {
    if (window.ffSyncPoller) clearInterval(window.ffSyncPoller);
    window.ffSyncPoller = setInterval(() => {
        if (document.visibilityState === 'visible' && location.href.toLowerCase().includes('marks')) {
            try {
                chrome.runtime.sendMessage({ action: 'triggerBackgroundCheck' }).catch(()=>{});
            } catch(e){}
        }
    }, 4 * 60 * 1000); // 4 minutes
}
startVisibilityAwarePolling();


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
        
        localStorage.setItem('ff_ui_enabled', ffUIEnabled);
        
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
            document.documentElement.classList.remove('ff-enabled'); // Remove sidebar aesthetic
            document.querySelectorAll('[data-ff-hidden]').forEach(el => {
                el.style.display = '';
                delete el.dataset.ffHidden;
            });
        } else {
            // Restore ReFlex UI: re-run the appropriate renderer
            document.documentElement.classList.add('ff-enabled'); // Restore sidebar aesthetic
            const url = location.href.toLowerCase();
            if (url.includes('marks'))      window.ffRunMarks      && window.ffRunMarks();
            else if (url.includes('transcript')) window.ffRunTranscript && window.ffRunTranscript();
            else if (url.includes('attendance')) window.ffRunAttendance && window.ffRunAttendance();
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
// 2.5. LOGIN PAGE TOGGLE & RECAPTCHA THEMING
// ══════════════════════════════════════════════════════════════════════════

function ffInjectLoginToggle() {
    if (!window.location.pathname.toLowerCase().includes('/login')) return;
    if (document.getElementById('ff-login-theme-toggle')) return;

    const isDark = document.documentElement.classList.contains('ff-dark');
    const themeBtn = document.createElement('div');
    themeBtn.id = 'ff-login-theme-toggle';
    themeBtn.className = 'ff-theme-switch ff-login-theme-switch' + (isDark ? ' dark' : '');
    themeBtn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    themeBtn.innerHTML = `<span class="ff-theme-icon">${isDark ? '☀️' : '🌙'}</span>`;
    
    themeBtn.addEventListener('click', () => {
        const nowDark = document.documentElement.classList.toggle('ff-dark');
        themeBtn.classList.toggle('dark', nowDark);
        themeBtn.querySelector('.ff-theme-icon').textContent = nowDark ? '☀️' : '🌙';
        themeBtn.title = nowDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        
        try {
            chrome.storage.sync.set({ ffTheme: nowDark ? 'dark' : 'light' }, () => {
                if (chrome.runtime.lastError) { /* ignore */ }
            });
        } catch (e) {
            console.warn('ReFlex: Could not save theme state.');
        }

        window.dispatchEvent(new CustomEvent('ff-theme-changed', { detail: { isDark: nowDark } }));
    });

    document.body.appendChild(themeBtn);
}
window.ffInjectLoginToggle = ffInjectLoginToggle;

function ffInjectRecaptchaThemer() {
    if (!window.location.pathname.toLowerCase().includes('/login')) return;

    // Inject main-world script to intercept grecaptcha
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('recaptcha-themer.js');
    (document.head || document.documentElement).appendChild(script);

    // DOM Observer for existing/new recaptcha elements
    const observer = new MutationObserver((mutations) => {
        const isDark = document.documentElement.classList.contains('ff-dark');
        if (!isDark) return;
        
        let shouldReset = false;
        mutations.forEach(m => {
            m.addedNodes.forEach(n => {
                if (n.nodeType === 1) {
                    if (n.classList && n.classList.contains('g-recaptcha')) {
                        if (!n.hasAttribute('data-theme')) {
                            n.setAttribute('data-theme', 'dark');
                            shouldReset = true;
                        }
                    } else if (n.querySelectorAll) {
                        n.querySelectorAll('.g-recaptcha:not([data-theme="dark"])').forEach(el => {
                            el.setAttribute('data-theme', 'dark');
                            shouldReset = true;
                        });
                    }
                }
            });
        });
        
        if (shouldReset) {
             window.dispatchEvent(new CustomEvent('ff-theme-changed', { detail: { isDark: true } }));
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.ffRecaptchaObserver = observer;
}
window.ffInjectRecaptchaThemer = ffInjectRecaptchaThemer;

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
    const rounded = Math.round(pct);
    return GPA_TIERS.find(t => rounded >= t.pct) || GPA_TIERS[GPA_TIERS.length - 1];
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
    document.querySelectorAll('.m-portlet, .m-subheader, .m-alert').forEach(el => {
        if (!el.closest('#ff-root')) {
            el.dataset.ffHidden = '1';
            el.style.display = 'none';
        }
    });
}

// Credit-hour cache for attendance fallback
const _crCache = {};
window.ffGetCreditHours = (code) => _crCache[code] ?? null;

window.ffTearDownMarks = function() {
    if (_outsideClickHandler) {
        document.removeEventListener('click', _outsideClickHandler);
        _outsideClickHandler = null;
    }
};

// ══════════════════════════════════════════════════════════════════════════
// 4. MARKS DASHBOARD
// ══════════════════════════════════════════════════════════════════════════

// ─ Empty State Helper ─────────────────────────────────────────────────
function showMarksEmptyState(root, semesterName) {
    const existing = root.querySelector('.ff-marks-empty-state');
    if (existing) existing.remove();

    const empty = document.createElement('div');
    empty.className = 'ff-marks-empty-state';
    empty.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 16px;">📚</div>
        <h3 style="margin: 0 0 8px 0; font-size: 1.3rem; font-weight: 600; color: var(--text-color);">
            No assessments available${semesterName ? ' for ' + esc(semesterName) : ''}
        </h3>
        <p style="margin: 0 0 20px 0; color: var(--text-muted); font-size: 0.95rem; max-width: 400px;">
            Your marks will appear here once your instructors upload assessments. Check back soon!
        </p>
    `;
    root.appendChild(empty);
}

function applyBestOfNPreprocessing(marksData) {
    marksData.forEach(course => {
        if (!course.categories) return;
        course.categories.forEach(cat => {
            if (cat.givenWeightage > 0 && cat.items.length > 0) {
                let sumWeights = 0;
                let firstWeight = null;
                let allSameWeight = true;
                let gradedItems = [];
                
                cat.items.forEach(item => {
                    if (item.weight > 0) {
                        sumWeights += item.weight;
                        if (firstWeight === null) firstWeight = item.weight;
                        else if (item.weight !== firstWeight) allSameWeight = false;
                        
                        if (item.obtained !== null && item.obtained !== undefined && item.total > 0) {
                            gradedItems.push(item);
                        }
                    }
                });

                if (allSameWeight && firstWeight > 0 && sumWeights > (cat.givenWeightage + 0.01)) {
                    const N = Math.round(cat.givenWeightage / firstWeight);
                    if (N > 0 && gradedItems.length > N) {
                        gradedItems.sort((a, b) => {
                            const pctA = a.obtained / a.total;
                            const pctB = b.obtained / b.total;
                            return pctB - pctA;
                        });
                        
                        for (let i = N; i < gradedItems.length; i++) {
                            gradedItems[i]._isDropped = true;
                        }
                    }
                }
            }
        });
    });
}

function renderMarksDashboard(marksData, changedKeys, options = {}) {
    if (!ffUIEnabled) return;
    applyBestOfNPreprocessing(marksData);
    
    // Clear old click handler BEFORE wiping DOM to prevent detached closure leaks
    if (_outsideClickHandler) {
        document.removeEventListener('click', _outsideClickHandler);
        _outsideClickHandler = null;
    }
    if (_semDropdownCloseHandler) {
        document.removeEventListener('click', _semDropdownCloseHandler);
        _semDropdownCloseHandler = null;
    }

    hideNative();

    const root = mountRoot();

    // ─ Recent Updates Drawer ──────────────────────────────────────────
    let recentUpdates = [];
    if (options.allUpdates) {
        recentUpdates = options.allUpdates.map(upd => {
            const courseIdx = marksData.findIndex(c => c.courseName === upd.fullCourseName);
            return { ...upd, courseIdx };
        });
    } else {
        marksData.forEach((course, courseIdx) => {
            const codeMatch = course.courseName.match(/^([A-Z]{2,4}\d{4})/i);
            const courseCode = codeMatch ? codeMatch[1] : course.courseName.substring(0, 7);

            course.categories.forEach(cat => {
                cat.items.forEach(item => {
                    const courseKey = `${course.courseName}||${cat.name}||${item.label}`;
                    if (changedKeys && changedKeys.has(courseKey + '|NEW')) {
                        const qStr = `${courseKey.replace(/\|\|/g, ' > ')} (NEW)`;
                        const semId = window._ffCurrentSemesterId || 'unknown';
                        const semName = (window._ffSemesterInfo && window._ffSemesterInfo.selectedName) || semId;
                        recentUpdates.push({ semId, semName, courseCode, courseIdx, fullCourseName: course.courseName, catName: cat.name, item, type: 'NEW', courseKey: `${semId}::${courseKey}`, queueString: `[${semName}] ${qStr}` });
                    } else if (changedKeys && changedKeys.has(courseKey + '|UPDATED')) {
                        const qStr = `${courseKey.replace(/\|\|/g, ' > ')} (UPDATED)`;
                        const semId = window._ffCurrentSemesterId || 'unknown';
                        const semName = (window._ffSemesterInfo && window._ffSemesterInfo.selectedName) || semId;
                        recentUpdates.push({ semId, semName, courseCode, courseIdx, fullCourseName: course.courseName, catName: cat.name, item, type: 'UPDATED', courseKey: `${semId}::${courseKey}`, queueString: `[${semName}] ${qStr}` });
                    }
                });
            });
        });
    }

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
            
            let sName = upd.semName;
            if (/^\d{5}$/.test(sName)) {
                const nativeSelect = document.querySelector('select#SemId');
                if (nativeSelect) {
                    const opt = Array.from(nativeSelect.options).find(o => o.value === sName);
                    if (opt) sName = opt.textContent.trim();
                }
            }

            let semBadgeHtml = '';
            if (upd.semId && upd.semId !== window._ffCurrentSemesterId) {
                semBadgeHtml = `<span style="font-size: 10px; background: rgba(100,116,139,0.1); border: 1px solid var(--border-color); color: var(--text-muted); padding: 2px 6px; border-radius: 4px; margin-right: 6px; line-height: 1;">${esc(sName)}</span>`;
            }
            
            updatesHtml += `
                <div class="ff-updates-drawer-row" data-course-idx="${upd.courseIdx}" data-sem-id="${esc(upd.semId)}" data-cat-name="${esc(upd.catName)}" data-item-label="${esc(upd.item.label)}">
                    <div class="ff-updates-drawer-row-left">
                        <span class="ff-updates-drawer-row-course">${esc(upd.courseCode)}</span>
                        ${semBadgeHtml}
                        <span class="ff-updates-drawer-row-item">${esc(itemName)} (${esc(upd.catName)})</span>
                    </div>
                    <div class="ff-updates-drawer-row-right" style="display: flex; align-items: center; gap: 8px;">
                        <span class="ff-updates-drawer-row-score">${esc(String(obtainedStr))} / ${esc(String(upd.item.total))}</span>
                        <span class="${badgeClass}">${upd.type}</span>
                        <button class="ff-mark-read-btn" data-course-key="${esc(upd.courseKey)}" data-queue-string="${esc(upd.queueString)}" title="Mark as Read" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0 4px; font-weight: bold; font-size: 14px; transition: color 0.2s;">✓</button>
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
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h4 style="margin: 0;">🔔 Recent Updates</h4>
                ${recentUpdates.length > 0 ? `<button id="ff-mark-all-read" style="background: none; border: 1px solid var(--border-color); color: var(--text-muted); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s;">Mark All ✓</button>` : ''}
            </div>
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

    // ─ Mark As Read Listeners ──────────────────────────────────────────
    const markAllBtn = drawer.querySelector('#ff-mark-all-read');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // prevent row click
            const uiKeys = recentUpdates.map(u => u.courseKey);
            const queueStrings = recentUpdates.map(u => u.queueString);
            markAllBtn.disabled = true;
            try {
                const semesterId = window._ffCurrentSemesterId || 'unknown';
                const response = await chrome.runtime.sendMessage({ action: 'markAsRead', uiKeys, queueStrings, semesterId });
                if (!response || response.status !== 'processed') throw new Error('Mark as read failed');
            } catch (err) {
                markAllBtn.disabled = false;
                markAllBtn.style.color = 'var(--danger-color)';
                setTimeout(() => markAllBtn.style.color = 'var(--text-muted)', 2000);
                return;
            }
            
            // Instantly clear the UI visually without reloading
            drawer.querySelector('.ff-updates-list').innerHTML = `
                <div class="ff-updates-empty">
                    <span style="font-size: 1.6rem;">🎉</span>
                    <span>No new updates. All your grades are up-to-date!</span>
                </div>
            `;
            drawer.querySelector('.ff-pull-tab-text').textContent = 'No Updates';
            markAllBtn.remove(); // hide the Mark All button
        });
    }

    drawer.querySelectorAll('.ff-mark-read-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation(); // prevent row click
            const uiKey = btn.getAttribute('data-course-key');
            const qStr = btn.getAttribute('data-queue-string');
            btn.disabled = true;
            try {
                const semesterId = window._ffCurrentSemesterId || 'unknown';
                const response = await chrome.runtime.sendMessage({ action: 'markAsRead', uiKeys: [uiKey], queueStrings: [qStr], semesterId });
                if (!response || response.status !== 'processed') throw new Error('Mark as read failed');
            } catch (err) {
                btn.disabled = false;
                btn.style.color = 'var(--danger-color)';
                setTimeout(() => btn.style.color = 'var(--text-muted)', 2000);
                return;
            }
            
            // Instantly remove this specific row visually
            const row = btn.closest('.ff-updates-drawer-row');
            if (row) row.remove();
            
            // Update the header count dynamically
            const list = drawer.querySelector('.ff-updates-list');
            const remainingRows = list.querySelectorAll('.ff-updates-drawer-row').length;
            
            if (remainingRows === 0) {
                list.innerHTML = `
                    <div class="ff-updates-empty">
                        <span style="font-size: 1.6rem;">🎉</span>
                        <span>No new updates. All your grades are up-to-date!</span>
                    </div>
                `;
                drawer.querySelector('.ff-pull-tab-text').textContent = 'No Updates';
                if (markAllBtn) markAllBtn.remove();
            } else {
                drawer.querySelector('.ff-pull-tab-text').textContent = remainingRows + (remainingRows > 1 ? ' Updates' : ' Update');
            }
        });
    });

    // Toggle drawer open/close
    const pullTab = drawer.querySelector('.ff-updates-pull-tab');
    pullTab.addEventListener('click', (e) => {
        e.stopPropagation();
        drawer.classList.toggle('open');
    });
    
    // Restore preserved state
    if (options.drawerOpen) drawer.classList.add('open');

    // Click outside closes drawer
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
                const updSemId = row.getAttribute('data-sem-id');
                const catName = row.getAttribute('data-cat-name');
                const itemLabel = row.getAttribute('data-item-label');

                if (updSemId && updSemId !== 'unknown' && updSemId !== window._ffCurrentSemesterId) {
                    // Update is from another semester! Switch semester and reload.
                    const nativeSelect = document.querySelector('select#SemId');
                    const form = nativeSelect?.closest('form');
                    if (nativeSelect && form) {
                        sessionStorage.setItem('ff_manual_sem', 'true');
                        nativeSelect.value = updSemId;
                        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        if (typeof window.$ !== 'undefined') window.$(nativeSelect).trigger('change');
                        else form.submit();
                        
                        drawer.classList.remove('open');
                        return; // Let the page reload
                    }
                }

                // 1. Switch tab
                if (cIdx >= 0) {
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
                }

                // 3. Close drawer
                drawer.classList.remove('open');
            });
        });
    }

    // ─ Header ─────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'ff-header';
    
    const titleWrapper = document.createElement('div');
    titleWrapper.style.display = 'flex';
    titleWrapper.style.alignItems = 'center';
    titleWrapper.style.gap = '20px';
    
    const title = document.createElement('h2');
    title.innerHTML = `Marks`;
    title.style.margin = '0';
    
    // ─ Semester Selector ──────────────────────────────────────────────
    const semesterInfo = options.semesterInfo || window._ffSemesterInfo || null;
    let semesterDropdownEl = null;

    if (semesterInfo && semesterInfo.options && semesterInfo.options.length > 1) {
        const semWrapper = document.createElement('div');
        semWrapper.className = 'ff-semester-wrapper';

        const currentSemName = semesterInfo.selectedName || semesterInfo.options[0]?.name || 'Current';
        const semBtn = document.createElement('div');
        semBtn.className = 'ff-semester-selector';
        semBtn.innerHTML = `<span>${esc(currentSemName)}</span><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

        const dropdown = document.createElement('div');
        dropdown.className = 'ff-semester-dropdown';
        semesterDropdownEl = dropdown;

        semesterInfo.options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'ff-semester-option' + (opt.id === semesterInfo.selectedId ? ' active' : '');
            item.textContent = opt.name;
            item.addEventListener('click', () => {
                if (opt.id === semesterInfo.selectedId) {
                    dropdown.classList.remove('open');
                    semBtn.classList.remove('open');
                    return;
                }
                
                // Mark that the user manually selected a semester to prevent auto-fallback later
                sessionStorage.setItem('ff_manual_sem', 'true');
                
                const nativeSelect = document.querySelector('select#SemId');
                const form = nativeSelect?.closest('form');
                if (nativeSelect && form) {
                    dropdown.classList.remove('open');
                    semBtn.classList.remove('open');
                    
                    // Show loading on the button
                    const titleNode = semBtn.querySelector('span');
                    if (titleNode) titleNode.textContent = opt.name + ' (Loading...)';
                    
                    nativeSelect.value = opt.id;
                    nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof window.$ !== 'undefined') window.$(nativeSelect).trigger('change');
                    else form.submit();
                }
            });
            dropdown.appendChild(item);
        });

        semBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
            semBtn.classList.toggle('open');
        });

        semWrapper.appendChild(semBtn);
        semWrapper.appendChild(dropdown);
        titleWrapper.appendChild(title);
        titleWrapper.appendChild(semWrapper);
    } else {
        titleWrapper.appendChild(title);
    }

    // Close semester dropdown when clicking outside — only register if the dropdown was actually created
    if (semesterDropdownEl) {
        _semDropdownCloseHandler = (e) => {
            if (!semesterDropdownEl.parentNode?.contains(e.target)) {
                semesterDropdownEl.classList.remove('open');
                const semBtn = document.querySelector('.ff-semester-selector');
                if (semBtn) semBtn.classList.remove('open');
            }
        };
        document.addEventListener('click', _semDropdownCloseHandler);
    }

    const syncBtn = document.createElement('div');
    syncBtn.id = 'ff-sync-marks-btn';
    syncBtn.title = 'Sync Marks';
    syncBtn.style.cssText = 'cursor: pointer; height: 32px; padding: 0 12px; border-radius: 6px; background: var(--card-bg); display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--border-color); color: var(--text-muted); font-size: 13px; font-weight: 500; transition: all 0.2s;';
    syncBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.4s;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg><span>Sync marks</span>`;
    
    syncBtn.addEventListener('mouseover', () => {
        syncBtn.style.borderColor = 'var(--text-color)';
        syncBtn.style.color = 'var(--text-color)';
    });
    syncBtn.addEventListener('mouseout', () => {
        syncBtn.style.borderColor = 'var(--border-color)';
        syncBtn.style.color = 'var(--text-muted)';
    });
    syncBtn.addEventListener('click', () => {
        if (syncBtn.style.pointerEvents === 'none') return;
        syncBtn.style.pointerEvents = 'none';
        syncBtn.style.opacity = '0.5';
        const svg = syncBtn.querySelector('svg');
        svg.style.transform = `rotate(${(parseInt(svg.dataset.rot||0) + 360)}deg)`;
        svg.dataset.rot = (parseInt(svg.dataset.rot||0) + 360);
        try {
            chrome.runtime.sendMessage({ action: 'syncSpecificSemester', semId: window._ffCurrentSemesterId || 'unknown' }).catch(()=>{});
        } catch(e) {}
    });
    
    const gpaBtn = document.createElement('div');
    gpaBtn.id = 'ff-gpa-planner-btn';
    gpaBtn.title = 'GPA Planner';
    gpaBtn.style.cssText = 'cursor: pointer; height: 32px; padding: 0 12px; border-radius: 6px; background: var(--card-bg); display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--border-color); color: var(--text-muted); font-size: 13px; font-weight: 500; transition: all 0.2s;';
    gpaBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg><span>GPA Planner</span>`;
    
    gpaBtn.addEventListener('mouseover', () => {
        gpaBtn.style.borderColor = 'var(--text-color)';
        gpaBtn.style.color = 'var(--text-color)';
    });
    gpaBtn.addEventListener('mouseout', () => {
        gpaBtn.style.borderColor = 'var(--border-color)';
        gpaBtn.style.color = 'var(--text-muted)';
    });
    gpaBtn.addEventListener('click', () => {
        if (window.ffToggleGpaPlanner) window.ffToggleGpaPlanner(marksData);
    });

    titleWrapper.appendChild(syncBtn);
    titleWrapper.appendChild(gpaBtn);
    header.appendChild(titleWrapper);
    
    root.appendChild(header);

    // ─ Empty Semester / New Student State ──────────────────────────────
    if (marksData.length === 0) {
        // Auto-fallback logic: if the current semester is empty, and the user hasn't
        // explicitly clicked a semester yet, find the most recent populated semester.
        if (semesterInfo && semesterInfo.options && semesterInfo.options.length > 1) {
            const isManual = sessionStorage.getItem('ff_manual_sem') === 'true';
            const currIndex = semesterInfo.options.findIndex(o => o.id === semesterInfo.selectedId);
            
            if (!isManual && currIndex !== -1 && currIndex < semesterInfo.options.length - 1) {
                const nativeSelect = document.querySelector('select#SemId');
                const form = nativeSelect?.closest('form');
                
                if (nativeSelect && form) {
                    // Temporarily show a notice that we are redirecting
                    const notice = document.createElement('div');
                    notice.className = 'ff-semester-notice';
                    notice.style.cssText = 'padding: 16px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px;';
                    notice.innerHTML = `
                        <span style="font-size: 1.3rem;">📋</span>
                        <span><strong>${esc(semesterInfo.selectedName || 'Current semester')}</strong> has no assessments yet. Searching for latest grades...</span>
                    `;
                    root.appendChild(notice);
                    
                    try {
                        chrome.storage.local.get(null, (data) => {
                            let targetOpt = null;
                            
                            // Look for the first older semester that has cached snapshots
                            for (let i = currIndex + 1; i < semesterInfo.options.length; i++) {
                                const checkId = semesterInfo.options[i].id;
                                if (Object.keys(data).some(k => k.startsWith(`ff_snap_${checkId}__`))) {
                                    targetOpt = semesterInfo.options[i];
                                    break;
                                }
                            }
                            
                            // If no snapshots found (e.g. fresh install), just cascade to the immediate next one
                            if (!targetOpt) {
                                targetOpt = semesterInfo.options[currIndex + 1];
                            }
                            
                            notice.innerHTML = `
                                <span style="font-size: 1.3rem;">📋</span>
                                <span><strong>${esc(semesterInfo.selectedName || 'Current semester')}</strong> has no assessments yet. Redirecting to <strong>${esc(targetOpt.name)}</strong>...</span>
                            `;
                            
                            nativeSelect.value = targetOpt.id;
                            nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                            if (typeof window.$ !== 'undefined') window.$(nativeSelect).trigger('change');
                            else form.submit();
                        });
                        return;
                    } catch (e) {
                        const fallbackOpt = semesterInfo.options[currIndex + 1];
                        notice.innerHTML = `
                            <span style="font-size: 1.3rem;">📋</span>
                            <span><strong>${esc(semesterInfo.selectedName || 'Current semester')}</strong> has no assessments yet. Redirecting to <strong>${esc(fallbackOpt.name)}</strong>...</span>
                        `;
                        nativeSelect.value = fallbackOpt.id;
                        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        if (typeof window.$ !== 'undefined') window.$(nativeSelect).trigger('change');
                        else form.submit();
                        return;
                    }
                }
            }
        }
        
        // Show the empty state.
        showMarksEmptyState(root, semesterInfo?.selectedName);
        return;
    }

    // ─ Course tabs ────────────────────────────────────────────────────
    const tabBar = document.createElement('div');
    tabBar.className = 'ff-course-tabs';
    header.appendChild(tabBar);

    let activeCourse = options.activeCourseIdx || 0;
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

        // --- BEST OF N LOGIC PREPROCESSING ---
        // (Handled globally by applyBestOfNPreprocessing at the start of renderMarksDashboard)

        // Compute overall score for this course
        let totalObtained = 0, totalWeight = 0;
        course.categories.forEach(cat => {
            cat.items.forEach(item => {
                if (item.obtained !== null && item.obtained !== undefined && !item._isDropped) {
                    const contrib = (item.weight > 0 && item.total > 0) ? (item.obtained / item.total) * item.weight : 0;
                    totalObtained += contrib;
                    totalWeight += item.weight;
                }
            });
        });
        const overallPct = totalWeight > 0 ? (totalObtained / totalWeight * 100) : 0;
        const tier = pctToGrade(overallPct);

        const isFullyGraded = Math.max(0, 100 - totalWeight) <= 0.01;
        const tab = document.createElement('div');
        tab.className = 'ff-tab' + (idx === activeCourse ? ' active' : '') + (isFullyGraded ? ' ff-tab-golden' : '');
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
        panel.style.display = idx === activeCourse ? '' : 'none';
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
                if (!item._isDropped) {
                    if (item.weight > 0 && item.total > 0 && item.obtained !== null && item.obtained !== undefined) {
                        gradedWeight += item.weight;
                    }
                    if (item.weight > 0 && item.total > 0 && item.avg !== null && item.avg !== undefined) {
                        totalAvgObtained += (item.avg / item.total) * item.weight;
                        avgGradedWeight += item.weight;
                    }
                }
            });
        });
        const ungradedWeight = Math.max(0, 100 - gradedWeight);

        let classAvgPct = avgGradedWeight > 0 ? (totalAvgObtained / avgGradedWeight * 100) : 0;
        
        // Use true class average from Grand Total if weightage is completely exhausted
        if (course.grandTotal && course.grandTotal.classAverage !== null && ungradedWeight <= 0.01) {
            classAvgPct = course.grandTotal.classAverage;
            totalAvgObtained = course.grandTotal.classAverage;
            avgGradedWeight = 100;
        }

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
                if (!item._isDropped) {
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
                if (item._isDropped) {
                    badge = '<span class="ff-badge-dropped" style="background:#64748b;color:#fff;font-size:0.65rem;padding:2px 6px;border-radius:4px;margin-right:6px;font-weight:700;letter-spacing:0.5px;">DROPPED</span>';
                } else {
                    if (changedKeys && changedKeys.has(courseKey + '|NEW'))     badge = '<span class="ff-badge-new">NEW</span>';
                    if (changedKeys && changedKeys.has(courseKey + '|UPDATED')) badge = '<span class="ff-badge-upd">UPD</span>';
                }

                const minMaxHtml = (item.min !== null && item.max !== null)
                    ? `<span class="ff-item-minmax">Min ${esc(String(item.min))} | Max ${esc(String(item.max))}</span>` : '';

                const row = document.createElement('div');
                row.id = `item-${idx}-${safeId(cat.name)}-${safeId(item.label)}`;
                row.className = 'ff-item-row' + (isItemBelow ? ' ff-item-below' : '');
                if (item._isDropped) row.style.opacity = '0.5';
                let itemName = item.label;
                if (!isNaN(itemName) || itemName.length <= 2) {
                    itemName = cat.name + ' #' + itemName;
                }

                row.innerHTML = `
                    <span class="ff-item-label" style="display: flex; align-items: center; flex: 1; min-width: 120px;">
                        ${isItemBelow ? '<i class="ff-warn-icon">!</i>' : ''}
                        ${badge}${esc(itemName)}
                    </span>
                    <span class="ff-item-weightage" title="Contributes ${esc(String(item.weight))}% to final grade" style="flex: 0 0 35px; text-align: center;">${esc(String(item.weight))}%</span>
                    <span class="ff-item-val" style="flex: 0 0 65px; text-align: right;">${esc(String(obtainedStr))} / ${esc(String(item.total))}</span>
                    <span class="ff-item-avg" style="flex: 0 0 55px; text-align: right;">${item.avg !== null && item.avg !== undefined ? `avg ${esc(String(item.avg.toFixed ? item.avg.toFixed(1) : item.avg))}` : ''}</span>
                    <span style="flex: 0 0 100px; text-align: right;">${minMaxHtml}</span>
                `;
                itemsTable.appendChild(row);
            });

            card.appendChild(itemsTable);
            grid.appendChild(card);
        });

        // ─ Grand Final Marks Card ─────────────────────────────────────
        if (course.grandTotal) {
            const gt = course.grandTotal;
            const gtCard = document.createElement('div');
            gtCard.className = 'ff-grand-total-card';
            gtCard.dataset.courseName = course.courseName;
            
            const totalStr = gt.totalMarks !== null ? gt.totalMarks : '-';
            const obtStr = gt.obtainedMarks !== null ? gt.obtainedMarks : '-';
            const avgStr = gt.classAverage !== undefined && gt.classAverage !== null ? gt.classAverage : '-';
            const minStr = gt.min !== null ? gt.min : '-';
            const maxStr = gt.max !== null ? gt.max : '-';
            const stdStr = gt.stdDev !== null ? gt.stdDev : '-';
            
            gtCard.innerHTML = `
                <div class="ff-gt-header" style="color: #fbbf24; border-bottom-color: rgba(251,191,36,0.15);">Grand Final Marks</div>
                <div class="ff-gt-grid">
                    <div class="ff-gt-stat"><span class="ff-gt-label">TOTAL</span><span class="ff-gt-val">${esc(String(totalStr))}</span></div>
                    <div class="ff-gt-stat"><span class="ff-gt-label">OBTAINED</span><span class="ff-gt-val ff-gt-highlight" style="color: #fbbf24;">${esc(String(obtStr))}</span></div>
                    <div class="ff-gt-stat"><span class="ff-gt-label">CLASS AVG</span><span class="ff-gt-val">${esc(String(avgStr))}</span></div>
                    <div class="ff-gt-stat"><span class="ff-gt-label">MIN</span><span class="ff-gt-val">${esc(String(minStr))}</span></div>
                    <div class="ff-gt-stat"><span class="ff-gt-label">MAX</span><span class="ff-gt-val">${esc(String(maxStr))}</span></div>
                    <div class="ff-gt-stat"><span class="ff-gt-label">STD DEV</span><span class="ff-gt-val">${esc(String(stdStr))}</span></div>
                </div>
            `;
            // Add golden styling natively
            gtCard.style.cssText = "background: linear-gradient(145deg, rgba(39, 33, 21, 0.6) 0%, rgba(23, 18, 8, 0.4) 100%); border: 1px solid rgba(251, 191, 36, 0.3); box-shadow: 0 4px 20px -2px rgba(251, 191, 36, 0.08);";
            
            panel.appendChild(gtCard);
        }
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

    // ── TRIGGER FIRST-TIME TUTORIAL ──
    try {
        chrome.storage.local.get(['ff_tutorial_v2_status'], (res) => {
            if (!res.ff_tutorial_v2_status || res.ff_tutorial_v2_status === 'unseen') {
                chrome.storage.local.set({ ff_tutorial_v2_status: 'in_progress' });
                setTimeout(() => {
                    if (window.ffRunTutorial) window.ffRunTutorial();
                }, 800); // Wait for DOM injection and CSS animations to settle
            }
        });
    } catch(e) {}
}
window.ffRunMarks = (isSilent) => { if (typeof runMarks === 'function') runMarks(isSilent); };

window.updateGrandTotalCardsInDOM = (marksData) => {
    applyBestOfNPreprocessing(marksData);
    marksData.forEach(course => {
        if (!course.grandTotal) return;
        let gtCard = document.querySelector(`.ff-grand-total-card[data-course-name="${course.courseName.replace(/"/g, '\\"')}"]`);
        if (!gtCard) {
            const panels = Array.from(document.querySelectorAll('#ff-root > div')).filter(div => !div.classList.contains('ff-header') && !div.classList.contains('ff-updates-drawer') && div.querySelector('.ff-progress-card'));
            const panel = panels[marksData.indexOf(course)];
            if (!panel) return;
            
            gtCard = document.createElement('div');
            gtCard.className = 'ff-grand-total-card';
            gtCard.dataset.courseName = course.courseName;
            gtCard.style.cssText = "background: linear-gradient(145deg, rgba(39, 33, 21, 0.6) 0%, rgba(23, 18, 8, 0.4) 100%); border: 1px solid rgba(251, 191, 36, 0.3); box-shadow: 0 4px 20px -2px rgba(251, 191, 36, 0.08);";
            panel.appendChild(gtCard);
        }
        
        const gt = course.grandTotal;
        const totalStr = gt.totalMarks !== null ? gt.totalMarks : '-';
        const obtStr = gt.obtainedMarks !== null ? gt.obtainedMarks : '-';
        const avgStr = gt.classAverage !== undefined && gt.classAverage !== null ? gt.classAverage : '-';
        const minStr = gt.min !== null ? gt.min : '-';
        const maxStr = gt.max !== null ? gt.max : '-';
        const stdStr = gt.stdDev !== null ? gt.stdDev : '-';
        
        gtCard.innerHTML = `
            <div class="ff-gt-header" style="color: #fbbf24; border-bottom-color: rgba(251,191,36,0.15);">Grand Final Marks</div>
            <div class="ff-gt-grid">
                <div class="ff-gt-stat"><span class="ff-gt-label">TOTAL</span><span class="ff-gt-val">${esc(String(totalStr))}</span></div>
                <div class="ff-gt-stat"><span class="ff-gt-label">OBTAINED</span><span class="ff-gt-val ff-gt-highlight" style="color: #fbbf24;">${esc(String(obtStr))}</span></div>
                <div class="ff-gt-stat"><span class="ff-gt-label">CLASS AVG</span><span class="ff-gt-val">${esc(String(avgStr))}</span></div>
                <div class="ff-gt-stat"><span class="ff-gt-label">MIN</span><span class="ff-gt-val">${esc(String(minStr))}</span></div>
                <div class="ff-gt-stat"><span class="ff-gt-label">MAX</span><span class="ff-gt-val">${esc(String(maxStr))}</span></div>
                <div class="ff-gt-stat"><span class="ff-gt-label">STD DEV</span><span class="ff-gt-val">${esc(String(stdStr))}</span></div>
            </div>
        `;
        
        // ── SURGICAL UPDATE OF ENTIRE PERFORMANCE CARD ──
        // The panel is the direct parent of the grand total card (a plain div with no class)
        const panel = gtCard.parentElement;
        if (!panel) return;
        
        // Recompute the user's overall score from latest data
        let totalObtained = 0, totalWeight = 0;
        let totalAvgObtained = 0, avgGradedWeight = 0;
        course.categories.forEach(cat => {
            cat.items.forEach(item => {
                if (!item._isDropped) {
                    if (item.obtained !== null && item.obtained !== undefined && item.weight > 0 && item.total > 0) {
                        totalObtained += (item.obtained / item.total) * item.weight;
                        totalWeight += item.weight;
                    }
                    if (item.avg !== null && item.avg !== undefined && item.weight > 0 && item.total > 0) {
                        totalAvgObtained += (item.avg / item.total) * item.weight;
                        avgGradedWeight += item.weight;
                    }
                }
            });
        });
        
        const gradedWeight = totalWeight;
        const overallPct = gradedWeight > 0 ? (totalObtained / gradedWeight * 100) : 0;
        const tier = pctToGrade(overallPct);
        const gs = gradeStyle(tier.label);
        
        // Update big score text + GPA badge
        const bigScore = panel.querySelector('.ff-big-score');
        if (bigScore) {
            if (bigScore.firstChild && bigScore.firstChild.nodeType === 3) {
                bigScore.firstChild.nodeValue = overallPct.toFixed(2) + '% ';
            }
            const badge = bigScore.querySelector('.ff-gpa-badge');
            if (badge) {
                badge.style.background = gs.bg;
                badge.style.borderColor = gs.border;
                badge.style.color = gs.text;
                badge.innerHTML = `${tier.label} &nbsp;&middot;&nbsp; ${tier.gpa.toFixed(2)} GPA`;
            }
        }
        
        // Update bar fill
        const barFill = panel.querySelector('.ff-bar-fill');
        if (barFill) barFill.style.width = Math.min(overallPct, 100).toFixed(1) + '%';
        
        // Update "me" pointer
        const ptrMe = panel.querySelector('.ff-ptr-me');
        if (ptrMe) ptrMe.style.left = Math.min(overallPct, 100).toFixed(1) + '%';
        
        const ptrLabelMe = panel.querySelector('.ff-ptr-label-me');
        if (ptrLabelMe) ptrLabelMe.innerHTML = `&#9660; ${overallPct.toFixed(2)}%`;
        
        // Update stats row — graded to date
        const statsRow = panel.querySelector('.ff-stats-row');
        if (statsRow) {
            const spans = statsRow.querySelectorAll('span');
            if (spans.length > 0) {
                spans[0].innerHTML = `Graded to Date: <strong>${totalObtained.toFixed(2)} / ${gradedWeight.toFixed(2)} wt</strong>`;
            }
        }
        
        // ── UPDATE CLASS AVERAGE IF WEIGHTAGE IS 100% ──
        let classAvgPct = avgGradedWeight > 0 ? (totalAvgObtained / avgGradedWeight * 100) : 0;
        let displayAvgObtained = totalAvgObtained;
        let displayAvgTotal = avgGradedWeight;
        
        if (gt.classAverage !== null && gt.classAverage !== undefined && (100 - gradedWeight) <= 0.01) {
            classAvgPct = gt.classAverage;
            displayAvgObtained = gt.classAverage;
            displayAvgTotal = 100;
        }
        
        if (classAvgPct > 0) {
            const rightAvgText = panel.querySelector('.ff-right-avg-text strong');
            if (rightAvgText) rightAvgText.textContent = classAvgPct.toFixed(2) + '%';
            
            const ptrAvg = panel.querySelector('.ff-ptr-avg');
            if (ptrAvg) ptrAvg.style.left = Math.min(classAvgPct, 100).toFixed(1) + '%';
            
            const ptrLabel = panel.querySelector('.ff-ptr-avg .ff-ptr-label');
            if (ptrLabel) ptrLabel.textContent = 'Class Avg ' + classAvgPct.toFixed(2) + '%';
            
            if (statsRow) {
                const spans = statsRow.querySelectorAll('span');
                if (spans.length > 1) {
                    spans[1].innerHTML = `Class Average: <strong>${displayAvgObtained.toFixed(2)} / ${displayAvgTotal.toFixed(2)} wt</strong>`;
                }
            }
        }
    });
};

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

    const noWeightBadge = document.createElement('span');
    noWeightBadge.className = 'ff-gpa-impossible';
    noWeightBadge.textContent = 'No remaining weight';
    noWeightBadge.style.display = 'none';
    noWeightBadge.style.marginLeft = '8px';
    row.appendChild(noWeightBadge);

    let showWeightage = false;
    result.style.cursor = 'pointer';
    result.title = 'Click to toggle between percentage and weightage';
    result.addEventListener('click', () => {
        showWeightage = !showWeightage;
        update();
    });

    function update() {
        const target = parseFloat(sel.value);
        // Because the university rounds up from .5, the minimum percentage needed is target - 0.5
        const minTarget = target > 0 ? target - 0.5 : 0;
        const currentContrib = currentPct * (gradedWeight / 100);
        
        if (ungradedWeight <= 0) {
            result.className = 'ff-gpa-top';
            result.textContent = 'Target achieved';
            noWeightBadge.style.display = '';
        } else {
            noWeightBadge.style.display = 'none';
            if (currentContrib >= minTarget) {
                result.className = 'ff-gpa-top';
                result.textContent = 'Already achieved!';
            } else {
                const neededWeight = minTarget - currentContrib;
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
    }
    sel.addEventListener('change', update);
    
    if (ungradedWeight <= 0) {
        sel.disabled = true;
        const currentTier = pctToGrade(currentPct);
        const exists = availableTiers.some(t => t.pct === currentTier.pct);
        if (!exists) {
            const opt = document.createElement('option');
            opt.value = currentTier.pct;
            opt.textContent = `${currentTier.label} (${currentTier.gpa.toFixed(2)})`;
            sel.appendChild(opt);
        }
        sel.value = currentTier.pct;
    } else {
        // Pre-select the tier just above current (accounting for rounding)
        const roundedCurrent = Math.round(currentPct);
        const nextTier = [...availableTiers].reverse().find(t => t.pct > roundedCurrent);
        if (nextTier) sel.value = nextTier.pct;
        else sel.value = availableTiers[0].pct;
    }
    
    update();
    return row;
}

// ══════════════════════════════════════════════════════════════════════════
// 5. TRANSCRIPT DASHBOARD
// ══════════════════════════════════════════════════════════════════════════

function triggerTranscriptPrint(sems) {
    if (!sems || !Array.isArray(sems) || sems.length === 0) return;

    try {
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("jsPDF not loaded properly. Please reload the page.");
        const { jsPDF } = window.jspdf;

        const doc = new jsPDF({ format: 'letter', unit: 'pt' });

        // Calculate File Name
        let filename = 'transcript';
        const validSems = sems.filter(s => s && s.name);
        if (validSems.length === 1) {
            const safeName = validSems[0].name.toString().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
            filename = 'transcript' + (safeName ? '_' + safeName : '');
        } else if (validSems.length > 1) {
            filename = 'transcript_all_semesters';
        }

        const userName = document.querySelector('.m-topbar .username, .m-topbar [class*="name"]')?.textContent?.trim() || 'Student';
        const margin = 40;
        let currentY = margin + 20;

        // Document Header (Only on Page 1)
        doc.setFontSize(26);
        doc.setFont("helvetica", "bold");
        const titleWidth = doc.getTextWidth("Transcript Report");
        doc.text("Transcript Report", (doc.internal.pageSize.width - titleWidth) / 2, currentY);
        currentY += 20;

        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120);
        const subText = `Student: ${userName} | Generated by ReFlex`;
        const subWidth = doc.getTextWidth(subText);
        doc.text(subText, (doc.internal.pageSize.width - subWidth) / 2, currentY);
        currentY += 25;

        doc.setDrawColor(220); // thin light gray line
        doc.setLineWidth(1);
        doc.line(margin, currentY, doc.internal.pageSize.width - margin, currentY);
        currentY += 35; // space after header

        // Iterate through semesters
        // Track which semesters actually have renderable data so page numbering is correct
        let renderedCount = 0;
        sems.forEach((sem) => {
            if (!sem) return;

            // Pre-build table body first so we can skip the whole block if empty
            const body = sem.courses && Array.isArray(sem.courses) ? sem.courses.map(c => {
                const cr = parseFloat(c.crhrs) || 0;
                const pts = parseFloat(c.points) || 0;
                let gpaText = 'N/A';
                const gradeUpper = (c.grade || '').trim().toUpperCase();
                if (gradeUpper && gradeUpper !== '-' && gradeUpper !== 'I' && gradeUpper !== 'W' && gradeUpper !== 'NC' && (c.remarks || '').trim().toUpperCase() !== 'NC' && (c.type || '').trim().toUpperCase() !== 'NON CREDIT') {
                    gpaText = pts.toFixed(2);
                }
                return [
                    c.code || '',
                    c.name || '',
                    cr.toString(),
                    (cr * pts).toFixed(2),
                    c.grade || '—',
                    gpaText
                ];
            }) : [];

            // Skip this semester entirely if it has no courses to render
            if (body.length === 0) return;

            // Force a new page for every semester EXCEPT the very first rendered one
            if (renderedCount > 0) {
                doc.addPage();
                currentY = margin + 30; // start slightly lower on new pages
            }
            renderedCount++;

            // Semester Header
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(0);
            doc.text(sem.name || 'Unknown Semester', margin, currentY);
            
            const sgpa = sem.sgpa || 'N/A';
            const cgpa = sem.cgpa || 'N/A';
            const statsText = `SGPA: ${sgpa}    CGPA: ${cgpa}`;
            doc.setFontSize(12); // Reverted back to previous size
            doc.text(statsText, doc.internal.pageSize.width - margin, currentY, { align: 'right' });
            currentY += 8;

            // Thick black line under semester title
            doc.setDrawColor(0);
            doc.setLineWidth(1.5);
            doc.line(margin, currentY, doc.internal.pageSize.width - margin, currentY);
            currentY += 10;

            if (body.length > 0) {
                doc.autoTable({
                    startY: currentY,
                    margin: { left: margin, right: margin },
                    head: [['COURSE CODE', 'COURSE NAME', 'CR. HRS', 'POINTS', 'GRADE', 'GPA']],
                    body: body,
                    theme: 'plain',
                    headStyles: { 
                        fillColor: false, 
                        textColor: [120, 120, 120],
                        fontSize: 9, 
                        fontStyle: 'bold',
                        lineWidth: 0,
                        cellPadding: { top: 6, bottom: 6, left: 5, right: 5 }
                    },
                    bodyStyles: { 
                        fontSize: 9, 
                        textColor: [50, 50, 50],
                        cellPadding: { top: 8, bottom: 8, left: 5, right: 5 },
                        fillColor: [255, 255, 255]
                    },
                    didParseCell: function (data) {
                        if (data.section === 'head' && data.column.index >= 2) {
                            data.cell.styles.halign = 'center';
                        }
                        if (data.section === 'body' && data.row.index % 2 !== 0) {
                            data.cell.styles.fillColor = [241, 243, 246]; // Perfectly balanced subtle slate gray
                        }
                    },
                    columnStyles: {
                        0: { cellWidth: 80 },
                        1: { cellWidth: 'auto' },
                        2: { cellWidth: 55, halign: 'center' },
                        3: { cellWidth: 55, halign: 'center' },
                        4: { cellWidth: 55, halign: 'center', fontStyle: 'bold' },
                        5: { cellWidth: 55, halign: 'center' }
                    },
                    willDrawCell: function (data) {
                        // Draw a thin gray line exactly beneath the headers
                        if (data.row.section === 'head') {
                            doc.setDrawColor(220);
                            doc.setLineWidth(1);
                            doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
                        }
                    }
                });
                currentY = doc.autoTable.previous.finalY + 30;
            }
        });

        // Add Global Footer to all pages
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            const str = "Disclaimer: This document is generated by ReFlex for informational purposes only and is not for official use. Official transcripts are strictly issued by the FAST-NUCES administration.";
            
            const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
            
            // Draw a dashed line above disclaimer
            doc.setDrawColor(210);
            doc.setLineWidth(0.5);
            doc.setLineDash([2, 2], 0);
            doc.line(margin, pageHeight - 40, doc.internal.pageSize.width - margin, pageHeight - 40);
            doc.setLineDash([]); // Reset line dash

            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(150);
            const textLines = doc.splitTextToSize(str, doc.internal.pageSize.width - margin * 2);
            textLines.forEach((line, idx) => {
                const w = doc.getTextWidth(line);
                doc.text(line, (doc.internal.pageSize.width - w) / 2, pageHeight - 30 + (idx * 10));
            });
        }

        doc.save(filename + '.pdf');

    } catch (e) {
        console.error("jsPDF generation failed:", e);
        alert("PDF generation failed. Check the console for details.");
    }
}


function renderTranscriptDashboard(semesters) {
    if (!ffUIEnabled) return;
    hideNative();

    const root = mountRoot();

    const header = document.createElement('div');
    header.className = 'ff-header';
    header.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap: wrap; gap: 16px;">
            <h2 style="margin: 0;">Transcript Dashboard</h2>
            <div class="ff-transcript-actions" style="display:${semesters.length === 0 ? 'none' : 'flex'}; gap:12px;">
                <button id="ff-dl-sem-btn" class="ff-btn ff-btn-outline" title="Download Current Semester PDF">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Current Semester
                </button>
                <button id="ff-dl-all-btn" class="ff-btn ff-btn-primary" title="Download Full Transcript PDF">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Full Transcript
                </button>
            </div>
        </div>
    `;
    root.appendChild(header);
    
    // ─ Empty Transcript / New Student State ──────────────────────────────
    if (semesters.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ff-marks-empty-state';
        empty.style.marginTop = '40px';
        empty.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 16px;">🎓</div>
            <h3 style="margin: 0 0 8px 0; font-size: 1.3rem; font-weight: 600; color: var(--text-color);">
                No academic records found
            </h3>
            <p style="margin: 0 0 20px 0; color: var(--text-muted); font-size: 0.95rem; max-width: 400px;">
                Your transcript is currently empty. Your courses and grades will appear here once your first semester concludes.
            </p>
        `;
        root.appendChild(empty);
        return;
    }
    
    let currentSemesterIndex = semesters.length > 0 ? semesters.length - 1 : 0;
    
    setTimeout(() => {
        const dlSemBtn = document.getElementById('ff-dl-sem-btn');
        const dlAllBtn = document.getElementById('ff-dl-all-btn');
        if (dlSemBtn) dlSemBtn.onclick = () => triggerTranscriptPrint([semesters[currentSemesterIndex]]);
        if (dlAllBtn) dlAllBtn.onclick = () => triggerTranscriptPrint(semesters);
    }, 0);

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

            // Cache credit hours for all valid courses (even ongoing ones with '-' grade)
            if (cr > 0 && type !== 'NON CREDIT' && remarks !== 'NC') {
                const codeMatch = c.code.match(/^([A-Z]{2,4}\d{4})/i);
                if (codeMatch) _crCache[codeMatch[1].toUpperCase()] = cr;
            }

            // Ignore incomplete, withdrawn, or non-credit courses for GPA calculation
            if (cr > 0 && grade && grade !== '-' && grade !== 'I' && grade !== 'W' && grade !== 'NC' && remarks !== 'NC' && type !== 'NON CREDIT') {
                semPoints += pts * cr;
                semCrHrs  += cr;
                runningPoints += pts * cr;
                runningCrHrs  += cr;
            }
        });
        sem.sgpa = semCrHrs > 0 ? (semPoints / semCrHrs).toFixed(2) : '—';
        sem.cgpa = runningCrHrs > 0 ? (runningPoints / runningCrHrs).toFixed(2) : '—';
        sem.semCrHrs = semCrHrs;
    });

    // Persist credit-hour cache to storage for GPA Planner
    try {
        chrome.storage.local.set({ ff_credit_cache: _crCache });
    } catch(e) {}

    // Create Semester Tabs
    const tabsRow = document.createElement('div');
    tabsRow.className = 'ff-course-tabs';
    tabsRow.style.marginBottom = '24px';
    
    // Create the main card that will hold the courses
    const mainCard = document.createElement('div');
    mainCard.className = 'ff-semester-card ff-transcript-card';
    
    // Function to render a specific semester
    function renderSemester(index) {
        currentSemesterIndex = index;
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

            let gpaText = '<span style="opacity: 0.5;">N/A</span>';
            const gradeUpper = (c.grade || '').trim().toUpperCase();
            if (gradeUpper && gradeUpper !== '-' && gradeUpper !== 'I' && gradeUpper !== 'W' && gradeUpper !== 'NC' && (c.remarks || '').trim().toUpperCase() !== 'NC' && (c.type || '').trim().toUpperCase() !== 'NON CREDIT') {
                gpaText = pts.toFixed(2) + ' <span style="font-size: 0.85rem; opacity: 0.6; font-weight: 600; font-family: \'Inter\', sans-serif;">GPA</span>';
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
                '<div class="ff-tr-right" style="display: flex; align-items: center; gap: 15px;">' +
                    '<span class="ff-subject-gpa">' + gpaText + '</span>' +
                    '<div class="ff-grade-badge" style="background:' + gs.bg + ';border-color:' + gs.border + ';color:' + gs.text + '">' +
                        esc(c.grade || '—') +
                    '</div>' +
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

// ══════════════════════════════════════════════════════════════════════════
// 6. TUTORIAL ENGINE
// ══════════════════════════════════════════════════════════════════════════

window.ffRunTutorial = function() {
    if (document.getElementById('ff-tutorial-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'ff-tutorial-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.85); z-index: 99999; pointer-events: all; transition: opacity 0.3s ease; opacity: 0;';
    document.body.appendChild(overlay);

    const steps = [];
    
    // Step 1: Updates Drawer
    const updatesDrawer = document.querySelector('.ff-updates-drawer');
    if (updatesDrawer) {
        steps.push({
            el: updatesDrawer,
            title: 'Smart Notifications',
            text: 'This dropdown tracks all your newly uploaded marks. You never have to click through courses to find what was just graded—it will be highlighted right here!',
            pos: 'bottom',
            offsetY: 35
        });
    }

    // Step 2: Sync Marks
    const syncBtn = document.getElementById('ff-sync-marks-btn');
    if (syncBtn) {
        steps.push({
            el: syncBtn,
            title: 'Live Sync Engine',
            text: 'Because the original portal requires a full page reload to fetch new marks, click this to magically beam the latest marks straight from the server to your dashboard without refreshing!',
            pos: 'bottom'
        });
    }

    // Step 3: GPA Planner
    let gpaSidebar = document.getElementById('ff-gpa-sidebar');
    if (gpaSidebar && typeof _gpaSidebarOpen !== 'undefined' && _gpaSidebarOpen) {
        steps.push({
            el: gpaSidebar,
            title: 'GPA Planner Dashboard',
            text: 'Here is your interactive GPA sandbox. You can project your final grades and instantly see how many points each course contributes to your SGPA!',
            pos: 'left'
        });
    } else {
        const gpaBtn = document.getElementById('ff-gpa-planner-btn');
        if (gpaBtn) {
            steps.push({
                el: gpaBtn,
                title: 'GPA Planner',
                text: 'Click here to open your interactive GPA sandbox. You can project your final grades and instantly see how many points each course contributes to your SGPA!',
                pos: 'bottom'
            });
        }
    }

    // Step 4: Progress Bar
    const progCard = document.querySelector('.ff-progress-card');
    if (progCard) {
        steps.push({
            el: progCard,
            title: 'Your Overall Performance',
            text: 'This stylish progress bar gives you a complete overview of your performance at a glance. It dynamically calculates your current standing based on uploaded marks.',
            pos: 'bottom'
        });
    }

    // Step 5: Target Grade Toggle
    const targetRow = document.querySelector('.ff-gpa-row');
    if (targetRow) {
        steps.push({
            el: targetRow,
            title: 'Target Grade Calculator',
            text: 'Want an A? Click here to change your Target Grade. ReFlex will instantly calculate exactly what you need to score on your remaining assessments to achieve it!',
            pos: 'bottom'
        });
    }

    // Step 6: Marks Card
    const catCard = document.querySelector('.ff-card');
    if (catCard) {
        steps.push({
            el: catCard,
            title: 'Interactive Marks Cards',
            text: 'These stylized cards beautifully display your assignments. Try clicking "My Score" or "Class Average" to instantly toggle your view between raw Marks and Weightage!',
            pos: 'top'
        });
    }

    // Step 7: Extension Popup
    const topbarControls = document.getElementById('ff-topbar-controls');
    if (topbarControls) {
        steps.push({
            el: topbarControls,
            title: 'The ReFlex Extension Menu',
            text: 'Click the ReFlex icon in your browser toolbar to link your Google Account for live email alerts, toggle the UI, or replay this tutorial. If you love ReFlex, please star us on GitHub!',
            pos: 'bottom'
        });
    }

    if (steps.length === 0) {
        try {
            chrome.storage.local.set({ ff_tutorial_v2_status: 'completed' });
        } catch (e) {
            console.warn('ReFlex: Tutorial completion save skipped (Extension context invalidated).');
        }
        overlay.remove();
        return;
    }

    let currentStep = 0;
    
    const tooltip = document.createElement('div');
    tooltip.className = 'ff-tutorial-tooltip';
    tooltip.style.cssText = 'position: absolute; width: 320px; background: var(--card-bg, #1e1e2d); border: 1px solid var(--primary-color, #716aca); border-radius: 8px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 100000; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); opacity: 0; transform: translateY(10px); color: var(--text-color, #fff); font-family: inherit; pointer-events: all;';
    
    const tooltipTitle = document.createElement('h3');
    tooltipTitle.style.cssText = 'margin: 0 0 10px 0; font-size: 16px; font-weight: 600; color: var(--primary-color, #716aca);';
    
    const tooltipText = document.createElement('p');
    tooltipText.style.cssText = 'margin: 0 0 20px 0; font-size: 14px; line-height: 1.5; color: var(--text-muted, #a2a5b9);';
    
    const tooltipFooter = document.createElement('div');
    tooltipFooter.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
    
    const tooltipCounter = document.createElement('span');
    tooltipCounter.style.cssText = 'font-size: 12px; font-weight: 600; color: var(--text-muted, #a2a5b9);';
    
    const tooltipBtns = document.createElement('div');
    tooltipBtns.style.cssText = 'display: flex; gap: 10px;';
    
    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip';
    skipBtn.style.cssText = 'background: none; border: none; color: var(--text-muted, #a2a5b9); cursor: pointer; font-size: 13px; font-weight: 500; transition: color 0.2s;';
    skipBtn.onmouseover = () => skipBtn.style.color = '#fff';
    skipBtn.onmouseout = () => skipBtn.style.color = 'var(--text-muted, #a2a5b9)';
    
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next';
    nextBtn.style.cssText = 'background: var(--primary-color, #716aca); border: none; color: white; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; transition: background 0.2s;';
    nextBtn.onmouseover = () => nextBtn.style.background = '#5c54ad';
    nextBtn.onmouseout = () => nextBtn.style.background = 'var(--primary-color, #716aca)';
    
    tooltipBtns.appendChild(skipBtn);
    tooltipBtns.appendChild(nextBtn);
    tooltipFooter.appendChild(tooltipCounter);
    tooltipFooter.appendChild(tooltipBtns);
    
    tooltip.appendChild(tooltipTitle);
    tooltip.appendChild(tooltipText);
    tooltip.appendChild(tooltipFooter);
    document.body.appendChild(tooltip);

    let activeEl = null;
    let activeOrigZ = '';
    let activeOrigPos = '';

    const tutorialInterval = setInterval(() => {
        if (!activeEl) return;
        
        // Dynamically hot-swap activeEl for GPA Planner if user toggles it during the tutorial
        const currentTitle = steps[currentStep]?.title;
        if (currentTitle === 'GPA Planner' || currentTitle === 'GPA Planner Dashboard') {
            const isSidebarOpen = typeof _gpaSidebarOpen !== 'undefined' && _gpaSidebarOpen;
            const targetId = isSidebarOpen ? 'ff-gpa-sidebar' : 'ff-gpa-planner-btn';
            const expectedEl = document.getElementById(targetId);
            
            if (expectedEl && activeEl !== expectedEl) {
                activeEl.style.zIndex = activeOrigZ;
                activeEl.style.position = activeOrigPos;
                
                activeEl = expectedEl;
                activeOrigZ = activeEl.style.zIndex;
                activeOrigPos = activeEl.style.position;
                
                const compPos = window.getComputedStyle(activeEl).position;
                if (compPos === 'static') activeEl.style.position = 'relative';
                activeEl.style.zIndex = '100000';
                
                steps[currentStep].el = activeEl;
                steps[currentStep].pos = isSidebarOpen ? 'left' : 'bottom';
                steps[currentStep].title = isSidebarOpen ? 'GPA Planner Dashboard' : 'GPA Planner';
                steps[currentStep].text = isSidebarOpen ? 'Here is your interactive GPA sandbox. You can project your final grades and instantly see how many points each course contributes to your SGPA!' : 'Click here to open your interactive GPA sandbox. You can project your final grades and instantly see how many points each course contributes to your SGPA!';
                tooltipTitle.textContent = steps[currentStep].title;
                tooltipText.textContent = steps[currentStep].text;
            }
        }
        
        positionTooltip(steps[currentStep]);
    }, 50);

    function renderStep() {
        if (activeEl) {
            activeEl.style.zIndex = activeOrigZ;
            activeEl.style.position = activeOrigPos;
        }

        if (currentStep >= steps.length) {
            cleanup();
            return;
        }

        const step = steps[currentStep];
        activeEl = step.el;
        
        activeOrigZ = activeEl.style.zIndex;
        activeOrigPos = activeEl.style.position;
        const compPos = window.getComputedStyle(activeEl).position;
        if (compPos === 'static') activeEl.style.position = 'relative';
        activeEl.style.zIndex = '100000';
        
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        tooltipTitle.textContent = step.title;
        tooltipText.textContent = step.text;
        tooltipCounter.textContent = `${currentStep + 1} of ${steps.length}`;
        nextBtn.textContent = currentStep === steps.length - 1 ? 'Finish' : 'Next';

        positionTooltip(step);
        
        if (currentStep === 0) {
            setTimeout(() => {
                overlay.style.opacity = '1';
                tooltip.style.opacity = '1';
                tooltip.style.transform = 'translateY(0)';
            }, 50);
        }
    }

    function positionTooltip(step) {
        if (!activeEl) return;
        const rect = activeEl.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        let top = 0;
        let left = rect.left;
        
        let offsetY = step.offsetY || 0;
        
        if (step.pos === 'bottom') {
            top = rect.bottom + 15 + offsetY;
            if (top + (tooltipRect.height || 150) > window.innerHeight) top = rect.top - (tooltipRect.height || 150) - 15 - offsetY;
        } else if (step.pos === 'left') {
            top = rect.top + (rect.height / 2) - ((tooltipRect.height || 150) / 2);
            left = rect.left - 340 - offsetY;
            if (left < 20) left = rect.right + 15 + offsetY;
        } else if (step.pos === 'right') {
            top = rect.top + (rect.height / 2) - ((tooltipRect.height || 150) / 2);
            left = rect.right + 15 + offsetY;
            if (left + 320 > window.innerWidth) left = rect.left - 340 - offsetY;
        } else {
            top = rect.top - (tooltipRect.height || 150) - 15 - offsetY;
            if (top < 0) top = rect.bottom + 15 + offsetY;
        }
        
        if (step.pos === 'top' || step.pos === 'bottom') {
            if (left + 320 > window.innerWidth) left = window.innerWidth - 340;
            if (left < 20) left = 20;
        } else {
            if (top + (tooltipRect.height || 150) > window.innerHeight) top = window.innerHeight - (tooltipRect.height || 150) - 20;
            if (top < 20) top = 20;
        }

        tooltip.style.top = `${top + window.scrollY}px`;
        tooltip.style.left = `${left + window.scrollX}px`;
    }

    const resizeHandler = () => {
        if (activeEl) positionTooltip(steps[currentStep]);
    };
    window.addEventListener('resize', resizeHandler);

    function cleanup() {
        clearInterval(tutorialInterval);
        if (activeEl) {
            activeEl.style.zIndex = activeOrigZ;
            activeEl.style.position = activeOrigPos;
        }
        overlay.style.opacity = '0';
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translateY(10px)';
        setTimeout(() => {
            overlay.remove();
            tooltip.remove();
            window.removeEventListener('resize', resizeHandler);
        }, 300);
        try {
            chrome.storage.local.set({ ff_tutorial_v2_status: 'completed' });
        } catch (e) {
            console.warn('ReFlex: Tutorial completion save skipped (Extension context invalidated).');
        }
    }

    nextBtn.onclick = () => {
        currentStep++;
        renderStep();
    };

    skipBtn.onclick = cleanup;

    renderStep();
};

    let _watchStarted = false;
    function startWatch() {
        if (_watchStarted || typeof window.ffWatch !== 'function') return;
        _watchStarted = true;
        window.ffWatch();
    }
    
    function initReFlex() {
        startWatch();
        
        const injectLoginFeatures = () => {
            if (window.ffInjectLoginToggle) window.ffInjectLoginToggle();
            if (window.ffInjectRecaptchaThemer) window.ffInjectRecaptchaThemer();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectLoginFeatures);
        } else {
            injectLoginFeatures();
        }
    }

    if (typeof window.ffWatch === 'function') {
        initReFlex();
    } else {
        document.addEventListener('DOMContentLoaded', initReFlex);
    }
// ══════════════════════════════════════════════════════════════════════════
// 7. GPA PLANNER SIDEBAR
// ══════════════════════════════════════════════════════════════════════════

let _gpaSidebarOpen = false;
let _gpaSelections = {};
let _gpaUnlocked = {};
let _gpaCreditCache = {};
let _gpaSaveTimer = null;
const GPA_TIERS_PLANNER = [
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

function debounceSaveSelections() {
    clearTimeout(_gpaSaveTimer);
    _gpaSaveTimer = setTimeout(() => {
        try {
            chrome.storage.local.set({ 
                ff_gpa_planner_selections: _gpaSelections,
                ff_gpa_planner_unlocked: _gpaUnlocked
            });
        } catch(e) {}
    }, 500);
}

window.ffToggleGpaPlanner = function(marksData) {
    let sidebar = document.getElementById('ff-gpa-sidebar');
    const root = document.getElementById('ff-root');
    if (!root) return;

    if (_gpaSidebarOpen && sidebar) {
        sidebar.style.transform = 'translateX(100%)';
        setTimeout(() => sidebar.remove(), 300);
        _gpaSidebarOpen = false;
        return;
    }
    
    // SPAM LOCK: Prevent multiple sidebars if clicked during animation/async load
    if (sidebar) return;
    
    // Create drawer
    sidebar = document.createElement('div');
    sidebar.id = 'ff-gpa-sidebar';
    sidebar.className = 'ff-gpa-sidebar';
    sidebar.style.transform = 'translateX(100%)';
    root.appendChild(sidebar);
    
    // Read async data
    chrome.storage.local.get(['ff_credit_cache', 'ff_gpa_planner_selections', 'ff_gpa_planner_unlocked'], (res) => {
        _gpaCreditCache = res.ff_credit_cache || {};
        _gpaSelections = res.ff_gpa_planner_selections || {};
        _gpaUnlocked = res.ff_gpa_planner_unlocked || {};
        
        // Clean ghost data (selections for courses not in marksData)
        const currentCodes = new Set();
        marksData.forEach(c => {
            const m = c.courseName.match(/^([A-Z]{2,4}\d{4})/i);
            if (m) currentCodes.add(m[1].toUpperCase());
        });
        Object.keys(_gpaSelections).forEach(k => {
            if (!currentCodes.has(k)) delete _gpaSelections[k];
        });
        Object.keys(_gpaUnlocked).forEach(k => {
            if (!currentCodes.has(k)) delete _gpaUnlocked[k];
        });
        debounceSaveSelections();

        renderGpaPlannerUI(marksData, sidebar);
        
        // Slide in
        setTimeout(() => {
            sidebar.style.transform = 'translateX(0)';
            _gpaSidebarOpen = true;
        }, 10);
    });
};

function renderGpaPlannerUI(marksData, sidebar) {
    const gpaList = sidebar.querySelector('.ff-gpa-list');
    const savedScrollTop = gpaList ? gpaList.scrollTop : sidebar.scrollTop;

    if (Object.keys(_gpaCreditCache).length === 0) {
        sidebar.innerHTML = `
            <div class="ff-gpa-header">
                <h3>GPA Planner</h3>
                <span class="ff-gpa-close" id="ff-gpa-empty-close-btn">&times;</span>
            </div>
            <div class="ff-gpa-empty">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <p style="font-weight: 600; margin-top: 16px;">Credit-hour data unavailable.</p>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px; line-height: 1.4;">Visit the <b>Transcript</b> page once to load credit hours and enable the GPA Planner.</p>
            </div>
        `;
        const emptyCloseBtn = sidebar.querySelector('#ff-gpa-empty-close-btn');
        if (emptyCloseBtn) {
            emptyCloseBtn.addEventListener('click', () => {
                sidebar.style.transform = 'translateX(100%)';
                setTimeout(() => sidebar.remove(), 300);
                _gpaSidebarOpen = false;
            });
        }
        return;
    }

    let html = `
        <div class="ff-gpa-header">
            <h3>GPA Planner</h3>
            <span class="ff-gpa-close" id="ff-gpa-close-btn">&times;</span>
        </div>
        <div class="ff-gpa-hero">
            <span id="ff-gpa-reset-btn" class="ff-gpa-reset" title="Reset all to Current">↺</span>
            <div style="font-size: 13px; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">Projected Semester GPA</div>
            <div id="ff-gpa-hero-value" class="ff-gpa-hero-value">0.00</div>
        </div>
        <div class="ff-gpa-list">
    `;

    const coursesData = [];

    marksData.forEach(course => {
        const codeMatch = course.courseName.match(/^([A-Z]{2,4}\d{4})/i);
        if (!codeMatch) return;
        const code = codeMatch[1].toUpperCase();
        const displayName = course.courseName.replace(/^[A-Z]{2,4}\d{4}-?\s*/i, '').replace(/\s*\(.*\)$/, '').trim();
        const cr = _gpaCreditCache[code];

        if (!cr || cr <= 0) {
            html += `
                <div class="ff-planner-row ff-gpa-excluded">
                    <div class="ff-planner-row-info">
                        <strong>${esc(code)}</strong> - ${esc(displayName)}
                        <div class="ff-planner-row-meta"><span style="color:#eab308;font-weight:700;">!</span> Excluded (No Credit Info)</div>
                    </div>
                </div>`;
            return;
        }

        let totalObtained = 0, totalWeight = 0, gradedWeight = 0;
        course.categories.forEach(cat => {
            cat.items.forEach(item => {
                if (item.obtained !== null && item.obtained !== undefined && !item._isDropped) {
                    const contrib = (item.weight > 0 && item.total > 0) ? (item.obtained / item.total) * item.weight : 0;
                    totalObtained += contrib;
                    totalWeight += item.weight;
                    if (item.weight > 0 && item.total > 0) gradedWeight += item.weight;
                }
            });
        });
        
        const currentPct = totalWeight > 0 ? (totalObtained / totalWeight * 100) : 0;
        const currentTier = pctToGrade(currentPct);
        const ungradedWeight = Math.max(0, 100 - gradedWeight);

        let selectedGpa = _gpaSelections[code];
        if (selectedGpa === undefined) selectedGpa = currentTier.gpa;
        coursesData.push({ code, cr, currentPct, ungradedWeight, selectedGpa, currentTier, totalObtained });
        const isLocked = (ungradedWeight <= 0.01) && !_gpaUnlocked[code];
        if (isLocked) {
            // Force selected GPA to exactly what was achieved since no weight remains
            selectedGpa = currentTier.gpa;
            const cObj = coursesData.find(c => c.code === code);
            if (cObj) cObj.selectedGpa = selectedGpa;
        }

        const maxPossibleAbsolutePct = totalObtained + ungradedWeight;
        const uniqueTiers = Array.from(new Set(GPA_TIERS_PLANNER.map(t => t.gpa)))
            .map(gpa => GPA_TIERS_PLANNER.find(t => t.gpa === gpa))
            .filter(t => t.gpa >= 1.0);

        const hasRestrictions = (ungradedWeight <= 0.01) || uniqueTiers.some(t => !(maxPossibleAbsolutePct >= t.pct || t.gpa <= currentTier.gpa));
        let unlockIconHtml = '';
        if (hasRestrictions) {
            const svgLock = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
            const svgUnlock = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
            if (_gpaUnlocked[code]) {
                unlockIconHtml = `<div class="ff-unlock-btn" data-code="${esc(code)}" style="cursor:pointer; display:flex; align-items:center; user-select:none; opacity:0.6; transition:0.2s;" title="Restrictions Disabled (Click to Restore)" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">${svgUnlock}</div>`;
            } else {
                unlockIconHtml = `<div class="ff-unlock-btn" data-code="${esc(code)}" style="cursor:pointer; display:flex; align-items:center; user-select:none; opacity:0.4; transition:0.2s;" title="Unlock All Restrictions" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.4'">${svgLock}</div>`;
            }
        }

        html += `
            <div class="ff-planner-row">
                <div class="ff-planner-row-info">
                    <strong>${esc(code)}</strong> - ${esc(displayName)}
                    <div class="ff-planner-row-meta" id="ff-planner-meta-${esc(code)}"></div>
                </div>
                <div class="ff-planner-row-action" style="display:flex; align-items:center; gap:8px;">
                    ${unlockIconHtml}
                    <select class="ff-gpa-select" data-code="${esc(code)}" ${isLocked ? 'disabled' : ''}>
        `;

        uniqueTiers.sort((a,b) => b.gpa - a.gpa).forEach(t => {
            const isPossible = maxPossibleAbsolutePct >= t.pct || t.gpa <= currentTier.gpa || _gpaUnlocked[code];
            const labelText = `${t.label} (${t.gpa.toFixed(2)})`;
            if (isPossible || t.gpa === currentTier.gpa) {
                html += `<option value="${t.gpa}" ${selectedGpa === t.gpa ? 'selected' : ''}>${labelText}</option>`;
            } else {
                html += `<option value="${t.gpa}" disabled>${labelText} (x)</option>`;
            }
        });

        html += `
                    </select>
                </div>
            </div>
        `;
    });

    if (coursesData.length === 0) {
        sidebar.innerHTML = `
            <div class="ff-gpa-header">
                <h3>GPA Planner</h3>
                <span class="ff-gpa-close" id="ff-gpa-empty-close-btn">&times;</span>
            </div>
            <div class="ff-gpa-empty">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px; opacity: 0.8;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <p style="font-weight: 600;">No Grades Yet</p>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px; line-height: 1.4;">The GPA planner will activate once instructors upload assessments for this semester.</p>
            </div>
        `;
        const emptyCloseBtn = sidebar.querySelector('#ff-gpa-empty-close-btn');
        if (emptyCloseBtn) {
            emptyCloseBtn.addEventListener('click', () => {
                sidebar.style.transform = 'translateX(100%)';
                setTimeout(() => sidebar.remove(), 300);
                _gpaSidebarOpen = false;
            });
        }
        return;
    }

    html += `</div>`;
    sidebar.innerHTML = html;

    const newList = sidebar.querySelector('.ff-gpa-list');
    if (newList) newList.scrollTop = savedScrollTop;
    sidebar.scrollTop = savedScrollTop;

    sidebar.querySelector('#ff-gpa-close-btn').addEventListener('click', () => {
        sidebar.style.transform = 'translateX(100%)';
        setTimeout(() => sidebar.remove(), 300);
        _gpaSidebarOpen = false;
    });

    const selects = sidebar.querySelectorAll('.ff-gpa-select');
    selects.forEach(sel => {
        sel.addEventListener('change', (e) => {
            const code = e.target.dataset.code;
            const val = parseFloat(e.target.value);
            _gpaSelections[code] = val;
            debounceSaveSelections();
            
            const cObj = coursesData.find(c => c.code === code);
            if (cObj) cObj.selectedGpa = val;
            
            recalculateSemesterGpa(coursesData, sidebar);
        });
    });

    sidebar.querySelectorAll('.ff-unlock-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const code = e.currentTarget.dataset.code;
            _gpaUnlocked[code] = !_gpaUnlocked[code];
            const isNowUnlocked = _gpaUnlocked[code];
            
            const cObj = coursesData.find(c => c.code === code);
            const select = sidebar.querySelector(`.ff-gpa-select[data-code="${code}"]`);
            if (!cObj || !select) return;

            if (!isNowUnlocked) {
                delete _gpaSelections[code];
                cObj.selectedGpa = cObj.currentTier.gpa;
                select.value = cObj.currentTier.gpa;
            }
            debounceSaveSelections();

            const isLocked = (cObj.ungradedWeight <= 0.01) && !isNowUnlocked;
            if (isLocked) {
                select.setAttribute('disabled', 'true');
            } else {
                select.removeAttribute('disabled');
            }

            const maxPossibleAbsolutePct = cObj.totalObtained + cObj.ungradedWeight;
            const uniqueTiers = Array.from(new Set(GPA_TIERS_PLANNER.map(t => t.gpa)))
                .map(gpa => GPA_TIERS_PLANNER.find(t => t.gpa === gpa))
                .filter(t => t.gpa >= 1.0);
            
            uniqueTiers.sort((a,b) => b.gpa - a.gpa).forEach(t => {
                const isPossible = maxPossibleAbsolutePct >= t.pct || t.gpa <= cObj.currentTier.gpa || isNowUnlocked;
                const opt = select.querySelector(`option[value="${t.gpa}"]`);
                if (opt) {
                    if (isPossible || t.gpa === cObj.currentTier.gpa) {
                        opt.removeAttribute('disabled');
                        opt.textContent = `${t.label} (${t.gpa.toFixed(2)})`;
                    } else {
                        opt.setAttribute('disabled', 'true');
                        opt.textContent = `${t.label} (${t.gpa.toFixed(2)}) (x)`;
                    }
                }
            });

            const svgLock = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
            const svgUnlock = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
            
            if (isNowUnlocked) {
                e.currentTarget.innerHTML = svgUnlock;
                e.currentTarget.style.opacity = '0.6';
                e.currentTarget.title = "Restrictions Disabled (Click to Restore)";
                e.currentTarget.onmouseout = () => e.currentTarget.style.opacity = '0.6';
            } else {
                e.currentTarget.innerHTML = svgLock;
                e.currentTarget.style.opacity = '0.4';
                e.currentTarget.title = "Unlock All Restrictions";
                e.currentTarget.onmouseout = () => e.currentTarget.style.opacity = '0.4';
            }

            recalculateSemesterGpa(coursesData, sidebar);
        });
    });

    const resetBtn = sidebar.querySelector('#ff-gpa-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (window.confirm("Are you sure you want to revert all projections back to their initial state?")) {
                _gpaSelections = {};
                _gpaUnlocked = {};
                debounceSaveSelections();
                renderGpaPlannerUI(marksData, sidebar);
            }
        });
    }

    recalculateSemesterGpa(coursesData, sidebar);
}

function recalculateSemesterGpa(coursesData, sidebar) {
    let sumPts = 0;
    let sumCr = 0;
    coursesData.forEach(c => {
        sumPts += c.selectedGpa * c.cr;
        sumCr += c.cr;
    });

    const semGpa = sumCr > 0 ? (sumPts / sumCr) : 0;
    
    coursesData.forEach(c => {
        const metaDiv = sidebar.querySelector(`#ff-planner-meta-${esc(c.code)}`);
        if (metaDiv && sumCr > 0) {
            const contrib = ((c.selectedGpa * c.cr) / sumCr).toFixed(3);
            metaDiv.innerHTML = `<span class="ff-tr-code">${c.cr} Cr</span> <span class="ff-tr-sep">|</span> <span class="ff-tr-contrib">Contributes ${contrib} pts to SGPA</span>`;
        }
    });

    const hero = sidebar.querySelector('#ff-gpa-hero-value');
    if (hero) {
        hero.textContent = semGpa.toFixed(2);
        
        let color = 'var(--text-color)';
        if (semGpa >= 3.67) color = '#10b981';
        else if (semGpa >= 3.0) color = '#3b82f6';
        else if (semGpa >= 2.0) color = '#eab308';
        else color = '#ef4444';
        
        hero.style.color = color;
    }
}
})();
