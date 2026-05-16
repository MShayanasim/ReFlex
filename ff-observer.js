// ff-observer.js — SPA watcher + debounced DOM trigger + persistent guard

let lastUrl      = location.href;
let lastRunKey   = null;
let debounceTimer = null;
let guardObserver = null;   // watches for #ff-root being removed
let scanObserver  = null;   // watches for tables to appear (debounced)

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

    scanObserver.observe(document.body, { childList: true, subtree: true });
}

function checkTablesReady(url) {
    const tables = document.querySelectorAll('table');
    if (tables.length === 0) return false;

    // Use textContent (not innerText) — works before layout is computed.
    // Scan ALL rows, not just first-child, in case the header isn't row 1.
    function allCellText(table) {
        return Array.from(table.querySelectorAll('th, td'))
            .map(c => c.textContent.trim().toLowerCase());
    }

    if (url.includes('marks')) {
        for (const t of tables) {
            const cells = allCellText(t);
            if (cells.includes('weightage') && cells.some(h => h.includes('obtained'))) {
                if (t.querySelectorAll('tbody tr, .m-datatable__row').length > 1 || t.querySelectorAll('td').length > 5) {
                    return true;
                }
            }
        }
    }

    if (url.includes('transcript')) {
        for (const t of tables) {
            const cells = allCellText(t);
            if (cells.includes('code') && cells.some(h => h.includes('course'))) {
                if (t.querySelectorAll('tbody tr, .m-datatable__row').length > 1 || t.querySelectorAll('td').length > 5) {
                    return true;
                }
            }
        }
    }

    if (url.includes('attendance')) {
        for (const t of tables) {
            const cells = allCellText(t);
            if (cells.some(h => h.includes('presence'))) return true;
        }
    }

    return false;
}

function triggerOverhaul(url) {
    if (url.includes('marks'))      window.ffRunMarks      && window.ffRunMarks();
    if (url.includes('transcript')) window.ffRunTranscript && window.ffRunTranscript();
    if (url.includes('attendance')) window.ffRunAttendance && window.ffRunAttendance();

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

    guardObserver.observe(document.body, { childList: true, subtree: true });
}

// ── SPA Navigation Observer ───────────────────────────────────────────────
function syncSidebar() {
    const currentPath = location.pathname.toLowerCase();
    document.querySelectorAll('.m-menu__item').forEach(li => {
        li.classList.remove('m-menu__item--active', 'm-menu__item--open');
        const link = li.querySelector('a');
        if (link && link.href) {
            try {
                const linkPath = new URL(link.href).pathname.toLowerCase();
                // Home is exactly '/' or '/student/home' etc.
                if (linkPath === currentPath || (currentPath === '/' && (linkPath === '' || linkPath === '/'))) {
                    li.classList.add('m-menu__item--active', 'm-menu__item--open');
                } else if (currentPath.length > 2 && linkPath.length > 2 && (currentPath.startsWith(linkPath) || linkPath.startsWith(currentPath))) {
                    li.classList.add('m-menu__item--active', 'm-menu__item--open');
                }
            } catch(e) {}
        }
    });
}

function handleNavChange() {
    syncSidebar();
    window.ffInjectTopbarToggle && window.ffInjectTopbarToggle();

    const url = location.href.toLowerCase();
    const key = url.includes('marks')       ? 'marks'
              : url.includes('transcript')  ? 'transcript'
              : url.includes('attendance')  ? 'attendance'
              : null;

    const samePageAlreadyDone =
        url === lastUrl && key === lastRunKey && document.getElementById('ff-root');
    if (samePageAlreadyDone) return;

    const changed = url !== lastUrl || key !== lastRunKey;
    lastUrl    = url;
    lastRunKey = key;

    if (!key) {
        // Navigated away to a normal page — lift the veil immediately and tear down
        document.documentElement.classList.remove('ff-veil-native');
        tearDown();
        return;
    }

    if (changed) {
        // Drop the veil immediately to prevent flash of ugly native UI!
        if (key === 'marks' || key === 'transcript') {
            document.documentElement.classList.add('ff-veil-native');
        } else {
            document.documentElement.classList.remove('ff-veil-native');
        }

        tearDown();
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
    if (scanObserver)  { scanObserver.disconnect();  scanObserver  = null; }
    if (guardObserver) { guardObserver.disconnect(); guardObserver = null; }
    document.getElementById('ff-root')?.remove();
    document.querySelectorAll('[data-ff-hidden]').forEach(el => {
        el.style.display = '';
        delete el.dataset.ffHidden;
    });
    // Clean up attendance overlays
    window.ffTearDownAttendance && window.ffTearDownAttendance();
}

function watchNavigation() {
    window.addEventListener('popstate',   handleNavChange);
    window.addEventListener('hashchange', handleNavChange);

    const _push    = history.pushState.bind(history);
    const _replace = history.replaceState.bind(history);
    history.pushState    = (...a) => { _push(...a);    handleNavChange(); };
    history.replaceState = (...a) => { _replace(...a); handleNavChange(); };

    setInterval(handleNavChange, 800);

    // Handle the page we're already on
    handleNavChange();
}

// ── Change Detection ──────────────────────────────────────────────────────
// Storage layout: one key per course  →  ff_snap_CS1004, ff_snap_EL1005 …
// Each course key holds ~500–800 bytes max, nowhere near the 8KB sync limit.
const SNAP_PREFIX = 'ff_snap_';

function buildSnapshotKey(courseName, catName, itemLabel) {
    return `${catName}||${itemLabel}`;
}

function diffAndSave(marksData, callback) {
    // Build the keys we need to read: one per course
    const courseKeys = marksData.map(c => SNAP_PREFIX + c.courseName);

    chrome.storage.sync.get(courseKeys, stored => {
        const writes  = {};
        const changed = new Set();

        marksData.forEach(course => {
            const storeKey  = SNAP_PREFIX + course.courseName;
            const oldCourse = stored[storeKey] || {};
            const newCourse = {};

            course.categories.forEach(cat => {
                cat.items.forEach(item => {
                    const snapKey = buildSnapshotKey(course.courseName, cat.name, item.label);
                    const val     = `${item.obtained}|${item.totalMarks}`;
                    newCourse[snapKey] = val;

                    // Full key used by the UI badge lookup includes the course name
                    const uiKey = `${course.courseName}||${cat.name}||${item.label}`;
                    if (!(snapKey in oldCourse))          changed.add(uiKey + '|NEW');
                    else if (oldCourse[snapKey] !== val)  changed.add(uiKey + '|UPDATED');
                });
            });

            writes[storeKey] = newCourse;
        });

        chrome.storage.sync.set(writes);
        callback(changed);
    });
}

window.ffDiffAndSave  = diffAndSave;
window.ffBuildKey     = buildSnapshotKey;
window.ffWatch        = watchNavigation;
