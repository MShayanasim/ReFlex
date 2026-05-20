// ff-observer.js — SPA watcher + debounced DOM trigger + persistent guard

(function() {
    'use strict';
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

    const guardTarget = document.querySelector('.m-content, #m-content') || document.body;
    guardObserver.observe(guardTarget, { childList: true, subtree: true });
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
        if (key === 'marks' || key === 'transcript') {
            document.documentElement.classList.add('ff-veil-native');
        } else {
            document.documentElement.classList.remove('ff-veil-native');
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
    if (window.ffTopbarRetry) { clearInterval(window.ffTopbarRetry); window.ffTopbarRetry = null; }
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

    // Handle the page we're already on
    handleNavChange();
}

// ── Change Detection ──────────────────────────────────────────────────────
// Storage layout: one key per course  →  ff_snap_CS1004, ff_snap_EL1005 …
// Each course key holds ~500–800 bytes max, nowhere near the 8KB sync limit.
const SNAP_PREFIX = 'ff_snap_';
const SCHEMA_VERSION = 1;
const BADGE_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function buildSnapshotKey(courseName, catName, itemLabel) {
    return `${catName}||${itemLabel}`;
}

function _readAllStorage(callback) {
    chrome.storage.local.get(null, localStored => {
        if (chrome.runtime.lastError) localStored = {};
        chrome.storage.sync.get(null, syncStored => {
            if (chrome.runtime.lastError) {
                console.warn('ReFlex: Could not read sync storage.', chrome.runtime.lastError.message);
                syncStored = {};
            }
            // Merge: sync takes priority over local fallback
            callback({ ...localStored, ...syncStored });
        });
    });
}

function diffAndSave(marksData, callback) {
    // Fetch from BOTH sync and local — local is the fallback when sync quota is exceeded
    _readAllStorage(allStored => {

        // Schema Versioning Check
        if (allStored.ff_schema_version !== SCHEMA_VERSION) {
            const keysToWipe = Object.keys(allStored).filter(k => k.startsWith(SNAP_PREFIX));
            if (keysToWipe.length > 0) {
                chrome.storage.sync.remove(keysToWipe, () => {
                    if (chrome.runtime.lastError) console.warn('ReFlex: Schema wipe failed.', chrome.runtime.lastError.message);
                });
                chrome.storage.local.remove(keysToWipe);
            }
            allStored = {};
        }

        const writes  = { ff_schema_version: SCHEMA_VERSION };
        const activeKeys = new Set(marksData.map(c => SNAP_PREFIX + c.courseName));

        // 1. Garbage Collection: Remove old courses no longer on the page
        const keysToRemove = Object.keys(allStored).filter(k => k.startsWith(SNAP_PREFIX) && !activeKeys.has(k));
        if (keysToRemove.length > 0) {
            chrome.storage.sync.remove(keysToRemove, () => {
                if (chrome.runtime.lastError) console.warn('ReFlex: GC remove failed.', chrome.runtime.lastError.message);
            });
            chrome.storage.local.remove(keysToRemove);
        }

        // Retrieve existing badge timestamps
        const badgeTimestamps = allStored.ff_badge_timestamps || {};
        const now = Date.now();

        // 2. Process current courses and find NEW/UPDATED grades
        marksData.forEach(course => {
            const storeKey  = SNAP_PREFIX + course.courseName;
            const oldCourse = allStored[storeKey] || {};
            const newCourse = {};

            course.categories.forEach(cat => {
                cat.items.forEach(item => {
                    const snapKey = buildSnapshotKey(course.courseName, cat.name, item.label);
                    const val     = `${item.obtained}|${item.total}`;
                    newCourse[snapKey] = val;

                    // Full key used by the UI badge lookup
                    const uiKey = `${course.courseName}||${cat.name}||${item.label}`;
                    
                    if (!(snapKey in oldCourse)) {
                        badgeTimestamps[uiKey] = { type: 'NEW', timestamp: now };
                    } else {
                        let oldValStr = oldCourse[snapKey];
                        let [oldObtained, oldTotal] = oldValStr.split('|');
                        
                        // Handle backward compatibility where total was incorrectly saved as 'undefined'
                        if (oldTotal === 'undefined') {
                            oldTotal = String(item.total);
                        }
                        const normalizedOldVal = `${oldObtained}|${oldTotal}`;

                        if (normalizedOldVal !== val) {
                            // If it was previously ungraded (null), show as NEW instead of UPDATED
                            if (oldObtained === 'null' && item.obtained !== null) {
                                badgeTimestamps[uiKey] = { type: 'NEW', timestamp: now };
                            } else {
                                badgeTimestamps[uiKey] = { type: 'UPDATED', timestamp: now };
                            }
                        }
                    }
                });
            });

            writes[storeKey] = newCourse;
        });

        // Build valid UI Keys to prune deleted elements or stale entries
        const validUiKeys = new Set();
        marksData.forEach(course => {
            course.categories.forEach(cat => {
                cat.items.forEach(item => {
                    validUiKeys.add(`${course.courseName}||${cat.name}||${item.label}`);
                });
            });
        });

        // Prune expired or obsolete badges
        for (const uiKey in badgeTimestamps) {
            if (!validUiKeys.has(uiKey)) {
                delete badgeTimestamps[uiKey];
            } else if (now - badgeTimestamps[uiKey].timestamp > BADGE_EXPIRY_MS) {
                delete badgeTimestamps[uiKey];
            }
        }

        writes.ff_badge_timestamps = badgeTimestamps;

        // Compile set of changed keys (e.g. key|NEW or key|UPDATED) for rendering compatibility
        const changed = new Set();
        for (const uiKey in badgeTimestamps) {
            changed.add(uiKey + '|' + badgeTimestamps[uiKey].type);
        }

        // 3. Save new snapshot and trigger UI render
        chrome.storage.sync.set(writes, () => {
            if (chrome.runtime.lastError) {
                console.warn('ReFlex: Sync storage quota exceeded, falling back to local.', chrome.runtime.lastError.message);
            }
            // Always persist to local as backup for sync quota failures
            chrome.storage.local.set(writes);
            callback(changed);
        });
    });
}


    window.ffDiffAndSave  = diffAndSave;
    window.ffBuildKey     = buildSnapshotKey;
    window.ffWatch        = watchNavigation;
})();
