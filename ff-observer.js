// ff-observer.js — SPA watcher + debounced DOM trigger + persistent guard

(function() {
    'use strict';

    // ── Immediate Veil ────────────────────────────────────────────────────────
    // Apply SYNCHRONOUSLY at document_start, before any paint, to prevent the
    // 200–300ms flash of the native (Original) UI on marks/transcript pages.
    // The veil is removed later by triggerOverhaul() once ReFlex UI is ready,
    // or by handleNavChange() when navigating to a non-ReFlex page.
    (function immediateVeil() {
        if (localStorage.getItem('ff_ui_enabled') === 'false') return;
        const url = location.href.toLowerCase();
        if (url.includes('marks') || url.includes('transcript')) {
            document.documentElement.classList.add('ff-veil-native');
        }
    })();

    let lastUrl      = location.href;
    let lastRunKey   = null;
    let debounceTimer = null;
    let guardObserver = null;   // watches for #ff-root being removed
    let scanObserver  = null;   // watches for tables to appear (debounced)
    let failSafeTimer = null;   // fallback to remove veil if tables never appear

// ── Debounced DOM watcher ─────────────────────────────────────────────────
/**
 * Strategy: don't fire the moment the first table appears.
 * Instead, wait until DOM mutations have STOPPED for DEBOUNCE_MS.
 * This ensures the Angular SPA has finished its full render cycle
 * before we inject our UI.
 */
const DEBOUNCE_MS = 600;

function startScanWatcher() {
    if (scanObserver) scanObserver.disconnect();
    clearTimeout(failSafeTimer);

    // Fail-safe: if tables don't appear within 5 seconds, assume there are none and lift the veil.
    failSafeTimer = setTimeout(() => {
        if (scanObserver) { scanObserver.disconnect(); scanObserver = null; }
        document.documentElement.classList.remove('ff-veil-native');
    }, 5000);

    scanObserver = new MutationObserver(() => {
        // Reset the debounce timer on every mutation
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            // DOM has settled — check if tables are present
            const url = location.href.toLowerCase();
            if (!url.includes('marks') && !url.includes('transcript') && !url.includes('attendance')) return;
            if (url.includes('marks') || url.includes('transcript')) {
                if (document.getElementById('ff-root')) return; // already injected
            }

            const ready = checkTablesReady(url);
            if (ready) {
                scanObserver.disconnect(); // stop scanning — we have what we need
                triggerOverhaul(url);
            }
        }, DEBOUNCE_MS);
    });

    if (document.body) {
        scanObserver.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener("DOMContentLoaded", () => {
            if (scanObserver) scanObserver.observe(document.body, { childList: true, subtree: true });
        });
    }
}

function checkTablesReady(url) {
    const tables = document.querySelectorAll('table');
    if (tables.length === 0) return false;

    // Use textContent (not innerText) — works before layout is computed.
    // Scan ALL rows, not just first-child, in case the header isn't row 1.
    // Optimization: Short-circuit loop instead of mapping all cells to a new array
    if (url.includes('marks')) {
        for (const t of tables) {
            const cells = Array.from(t.querySelectorAll('th, td'));
            let hasWeightage = false;
            let hasObtained = false;
            for (const c of cells) {
                const text = c.textContent.trim().toLowerCase();
                if (text === 'weightage') hasWeightage = true;
                if (text.includes('obtained')) hasObtained = true;
                if (hasWeightage && hasObtained) break;
            }
            if (hasWeightage && hasObtained) {
                if (t.querySelectorAll('tbody tr, .m-datatable__row').length > 1 || cells.length > 5) {
                    return true;
                }
            }
        }
    }

    if (url.includes('transcript')) {
        for (const t of tables) {
            const cells = Array.from(t.querySelectorAll('th, td'));
            let hasCode = false;
            let hasCourse = false;
            for (const c of cells) {
                const text = c.textContent.trim().toLowerCase();
                if (text === 'code') hasCode = true;
                if (text.includes('course')) hasCourse = true;
                if (hasCode && hasCourse) break;
            }
            if (hasCode && hasCourse) {
                if (t.querySelectorAll('tbody tr, .m-datatable__row').length > 1 || cells.length > 5) {
                    return true;
                }
            }
        }
    }

    if (url.includes('attendance')) {
        for (const t of tables) {
            const cells = t.querySelectorAll('th, td');
            for (const c of cells) {
                if (c.textContent.toLowerCase().includes('presence')) return true;
            }
        }
    }

    return false;
}

function triggerOverhaul(url) {
    clearTimeout(failSafeTimer);
    if (url.includes('marks'))           window.ffRunMarks      && window.ffRunMarks();
    else if (url.includes('transcript')) window.ffRunTranscript && window.ffRunTranscript();
    else if (url.includes('attendance')) window.ffRunAttendance && window.ffRunAttendance();

    // Guard watcher only for pages where we replace the UI (not attendance)
    if (!url.includes('attendance')) startGuardWatcher(url);

    // Unveil the page now that our gorgeous UI is injected!
    document.documentElement.classList.remove('ff-veil-native');
}

// ── Persistent Guard ──────────────────────────────────────────────────────
/**
 * After we inject #ff-root, the SPA might STILL do async work (lazy data
 * fetching, re-renders, etc.) that removes our node or restores hidden
 * elements. This observer watches for exactly that and re-injects.
 */
function startGuardWatcher(url) {
    if (guardObserver) guardObserver.disconnect();

    guardObserver = new MutationObserver(() => {
        guardObserver.takeRecords(); // Prevent mutation queue memory bloat
        const root = document.getElementById('ff-root');

        if (!root) {
            // Our UI was wiped — re-inject after a short settle
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (!document.getElementById('ff-root') && checkTablesReady(location.href.toLowerCase())) {
                    triggerOverhaul(location.href.toLowerCase());
                }
            }, 400);
        }
    });

    // We MUST observe document.body with subtree: true because Angular can 
    // completely destroy and recreate the parent containers during internal 
    // re-renders (without URL changes). The callback is highly optimized 
    // (O(1) getElementById check) so it will not cause performance drops.
    const guardTarget = document.body; 
    
    guardObserver.observe(guardTarget, { 
        childList: true, 
        subtree: true 
    });
}

// ── SPA Navigation Observer ───────────────────────────────────────────────
function syncSidebar() {
    const doSync = () => {
        const currentUrl = location.href.toLowerCase();
        
        // Flex uses both hash routes (#/Student/Home) and standard routes (/Student/Home).
        // This perfectly normalizes them to extract just the meaningful path (student/home).
        const extractRoute = (url) => {
            try {
                const u = new URL(url);
                let path = u.pathname + u.hash;
                path = path.replace(/#/g, '').replace(/^\/+/, '').replace(/\/+$/, '').split('?')[0].toLowerCase();
                if (path === '' || path === 'student') return 'student/home';
                return path;
            } catch (e) { return ''; }
        };

        const currentRoute = extractRoute(currentUrl);

        document.querySelectorAll('.m-menu__item').forEach(li => {
            li.classList.remove('m-menu__item--active', 'm-menu__item--open');
            const link = li.querySelector('a');
            if (link && link.href) {
                const linkRoute = extractRoute(link.href);
                // Strict equality guarantees "Marks" doesn't overlap with "Marks PLO Report"
                if (currentRoute === linkRoute && currentRoute !== '') {
                    li.classList.add('m-menu__item--active', 'm-menu__item--open');
                }
            }
        });
    };
    
    doSync();
    // Angular router can sometimes wipe our classes during its digest cycle moments after navigation.
    // Staggered timeouts ensure our highlights stick permanently.
    setTimeout(doSync, 50);
    setTimeout(doSync, 200);
    setTimeout(doSync, 600);
}

function handleNavChange() {
    syncSidebar();

    const url = location.href.toLowerCase();
    const key = url.includes('marks')       ? 'marks'
              : url.includes('transcript')  ? 'transcript'
              : url.includes('attendance')  ? 'attendance'
              : null;

    const samePageAlreadyDone =
        url === lastUrl && key === lastRunKey && document.getElementById('ff-root');
    if (samePageAlreadyDone) {
        window.ffInjectTopbarToggle && window.ffInjectTopbarToggle();
        return;
    }

    const changed = url !== lastUrl || key !== lastRunKey;
    lastUrl    = url;
    lastRunKey = key;

    if (!key) {
        // Navigated away to a normal page — lift the veil immediately and tear down
        document.documentElement.classList.remove('ff-veil-native');
        tearDown();
        window.ffInjectTopbarToggle && window.ffInjectTopbarToggle();
        return;
    }

    if (changed) {
        // Drop the veil immediately to prevent flash of ugly native UI!
        if (localStorage.getItem('ff_ui_enabled') !== 'false') {
            if (key === 'marks' || key === 'transcript') {
                document.documentElement.classList.add('ff-veil-native');
            } else {
                document.documentElement.classList.remove('ff-veil-native');
            }
        }

        tearDown();
        window.ffInjectTopbarToggle && window.ffInjectTopbarToggle();

        startScanWatcher();
        // Immediate check — page may already be fully loaded with no pending mutations
        const curUrl = location.href.toLowerCase();
        if (checkTablesReady(curUrl)) {
            if (scanObserver) { scanObserver.disconnect(); scanObserver = null; }
            triggerOverhaul(curUrl);
        }
    }
}

function tearDown() {
    clearTimeout(debounceTimer);
    clearTimeout(failSafeTimer);
    if (window.ffTopbarRetry) { clearInterval(window.ffTopbarRetry); window.ffTopbarRetry = null; }
    if (window.ffGtPoller) { clearInterval(window.ffGtPoller); window.ffGtPoller = null; window.ffAngularReady = false; window.ffStartTime = null; }
    if (scanObserver)  { scanObserver.disconnect();  scanObserver  = null; }
    if (guardObserver) { guardObserver.disconnect(); guardObserver = null; }
    if (window.ffRecaptchaObserver) { window.ffRecaptchaObserver.disconnect(); window.ffRecaptchaObserver = null; }
    document.getElementById('ff-root')?.remove();
    document.querySelectorAll('[data-ff-hidden]').forEach(el => {
        el.style.display = '';
        delete el.dataset.ffHidden;
    });
    // Clean up overlays and event listeners
    window.ffTearDownMarks && window.ffTearDownMarks();
    window.ffTearDownAttendance && window.ffTearDownAttendance();
}

function watchNavigation() {
    window.addEventListener('popstate',   handleNavChange);
    window.addEventListener('hashchange', handleNavChange);

    if (!window._ffOriginalPushState) {
        window._ffOriginalPushState = history.pushState.bind(history);
        window._ffOriginalReplaceState = history.replaceState.bind(history);
        history.pushState    = (...a) => { window._ffOriginalPushState(...a);    handleNavChange(); };
        history.replaceState = (...a) => { window._ffOriginalReplaceState(...a); handleNavChange(); };
    }

    // Handle the page we're already on
    handleNavChange();
}

// ── Change Detection ──────────────────────────────────────────────────────
function buildSnapshotKey(courseName, catName, itemLabel) {
    return `${catName}||${itemLabel}`;
}

function diffAndSave(marksData, callback) {
    chrome.runtime.sendMessage({ action: 'processDiff', marksData }, (response) => {
        if (callback && response && response.changedKeys) {
            callback(new Set(response.changedKeys));
        } else if (callback) {
            callback(new Set());
        }
    });
}


    window.ffDiffAndSave  = diffAndSave;
    window.ffBuildKey     = buildSnapshotKey;
    window.ffWatch        = watchNavigation;
})();
