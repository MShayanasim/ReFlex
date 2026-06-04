// background.js — ReFlex 24/7 Keep-Alive & Grade Tracker

const SNAP_PREFIX = 'ff_snap_';
const BADGE_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
    setupAlarm();
});

chrome.runtime.onStartup.addListener(() => {
    setupAlarm();
});

function setupAlarm() {
    chrome.alarms.create('gradeCheck', { periodInMinutes: 15 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "gradeCheck") {
        // 1. Process any pending emails independently of the Flex session
        processEmailQueue();
        
        // 2. Attempt to fetch new grades from the background
        checkGradesInBackground();
    }
});

let diffQueue = Promise.resolve();

// We can also allow the popup or content script to trigger actions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'triggerBackgroundCheck') {
        checkGradesInBackground();
        sendResponse({ status: "started" });
    } else if (request.action === 'triggerEmailQueue') {
        processEmailQueue();
        sendResponse({ status: "started" });
    } else if (request.action === 'queueEmail') {
        queueEmailUpdates(request.updates);
        sendResponse({ status: "queued" });
    } else if (request.action === 'markAsRead') {
        processMarkAsRead(request.uiKeys, request.queueStrings);
        sendResponse({ status: "processed" });
    } else if (request.action === 'processDiff') {
        diffQueue = diffQueue.then(() => {
            return new Promise((resolveNext) => {
                try {
                    _robustDiffAndSave(request.marksData, (changedKeysSet) => {
                        if (changedKeysSet && changedKeysSet.size > 0) {
                            chrome.tabs.query({ url: "*://*.nu.edu.pk/*" }, (tabs) => {
                                tabs.forEach(tab => {
                                    chrome.tabs.sendMessage(tab.id, { action: 'NEW_MARKS_DATA' }).catch(() => {});
                                });
                            });
                        }
                        sendResponse({ changedKeys: Array.from(changedKeysSet) });
                        resolveNext();
                    });
                } catch (e) {
                    console.error("ReFlex Background: Diff failed", e);
                    sendResponse({ changedKeys: [] });
                    resolveNext();
                }
            });
        });
        return true; // Keep channel open for async
    }
});

function processMarkAsRead(uiKeys, queueStrings) {
    // 1. Remove from Email Queue
    chrome.storage.local.get(['pending_email_queue'], (res) => {
        if (res.pending_email_queue && res.pending_email_queue.length > 0) {
            const newQueue = res.pending_email_queue.filter(item => !queueStrings.includes(item));
            
            if (newQueue.length === 0) {
                // If queue is now empty, delete it and the timer
                chrome.storage.local.remove(['pending_email_queue', 'email_queue_start_time']);
            } else if (newQueue.length !== res.pending_email_queue.length) {
                chrome.storage.local.set({ pending_email_queue: newQueue });
            }
        }
    });

    // 2. Remove Badges from UI
    diffQueue = diffQueue.then(() => {
        return new Promise((resolve) => {
            _readStorage(allStored => {
                let badges = allStored.ff_badge_timestamps || {};
                let changed = false;
                
                uiKeys.forEach(key => {
                    if (badges[key]) {
                        delete badges[key];
                        changed = true;
                    }
                });

                if (changed) {
                    try {
                        chrome.storage.sync.set({ ff_badge_timestamps: badges }, () => {
                            if (chrome.runtime.lastError) {
                                chrome.storage.local.set({ ff_badge_timestamps: badges });
                            }
                            resolve();
                        });
                    } catch (e) {
                        chrome.storage.local.set({ ff_badge_timestamps: badges });
                        resolve();
                    }
                } else {
                    resolve();
                }
            });
        });
    });
}

function queueEmailUpdates(updatesArray) {
    chrome.storage.local.get(['pending_email_queue', 'email_queue_start_time'], (res) => {
        let queue = res.pending_email_queue || [];
        let startTime = res.email_queue_start_time || Date.now();
        
        let added = false;
        let queueSet = new Set(queue);
        updatesArray.forEach(update => {
            if (!queueSet.has(update)) {
                queueSet.add(update);
                queue.push(update);
                added = true;
            }
        });

        if (added) {
            chrome.storage.local.set({ 
                pending_email_queue: queue,
                email_queue_start_time: queue.length === updatesArray.length ? Date.now() : startTime 
            });
        }
    });
}

function processEmailQueue() {
    chrome.storage.local.get(['pending_email_queue', 'email_queue_start_time', 'userEmail'], (res) => {
        if (!res.userEmail) return;
        if (res.pending_email_queue && res.pending_email_queue.length > 0) {
            // Check if 45 minutes have passed since the first item was queued
            if (Date.now() - res.email_queue_start_time >= 45 * 60 * 1000) {
                const messageStr = res.pending_email_queue.join('<br>');
                
                // Pass the queue items to sendEmailSecurely so it can delete them on success
                sendEmailSecurely(res.userEmail, messageStr);
            }
        }
    });
}

const OAUTH_CLIENT_ID = '650320840540-bjo54gekj5o1m0s5cmekiq6c86op2f5e.apps.googleusercontent.com';

function getValidToken(callback) {
    chrome.storage.local.get(['authToken', 'tokenExpiry', 'refreshToken'], (res) => {
        // If token exists and hasn't expired (with 5 min buffer)
        if (res.authToken && res.tokenExpiry && Date.now() < res.tokenExpiry - 300000) {
            callback(res.authToken);
            return;
        }
        
        // Token expired. Check if we have a refresh token.
        if (!res.refreshToken) {
            console.error("ReFlex Background: No refresh token available. User must log in again.");
            callback(null);
            return;
        }

        // Use the refresh token to get a new access token via the Worker
        fetch('https://reflex-notifier.shayanasim-dev.workers.dev/api/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: OAUTH_CLIENT_ID,
                refresh_token: res.refreshToken
            })
        })
        .then(async tokenResponse => {
            if (!tokenResponse.ok) {
                const errTxt = await tokenResponse.text();
                console.error("ReFlex Background: Silent token refresh failed on worker.", errTxt);
                callback(null);
                return;
            }
            const tokenData = await tokenResponse.json();
            const newAccessToken = tokenData.access_token;
            const expiresIn = tokenData.expires_in || 3599;

            if (newAccessToken) {
                chrome.storage.local.set({
                    authToken: newAccessToken,
                    tokenExpiry: Date.now() + (expiresIn * 1000)
                }, () => {
                    callback(newAccessToken);
                });
            } else {
                callback(null);
            }
        })
        .catch(err => {
            console.error("ReFlex Background: Error during silent refresh:", err);
            callback(null);
        });
    });
}

function sendEmailSecurely(userEmail, messageStr) {
    getValidToken((token) => {
        if (!token) {
            console.error("ReFlex Background: Could not get auth token for email. User might be logged out.");
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'reflex-icon-128.png',
                title: 'ReFlex Email Alert',
                message: 'Failed to send email: Your Google session expired. Please open the ReFlex popup to log in again.'
            });
            return;
        }
        
        fetch('https://reflex-notifier.shayanasim-dev.workers.dev/api/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ email: userEmail, message: messageStr })
        }).then(async r => {
            if (!r.ok) {
                const errText = await r.text();
                console.error("ReFlex Background: Email Failed!", errText);
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'reflex-icon-128.png',
                    title: 'ReFlex Email Failed',
                    message: 'Server error: ' + errText
                });
            } else {
                console.log("ReFlex Background: Email Sent successfully!");
                // Clear the queue ONLY after successful delivery!
                chrome.storage.local.remove(['pending_email_queue', 'email_queue_start_time']);
            }
        }).catch(e => console.error(e));
    });
}

async function checkGradesInBackground() {
    try {
        const res = await fetch('https://flexstudent.nu.edu.pk/Student/Marks');
        if (!res.ok) return;

        const html = await res.text();
        
        // If the session expired, it redirects to the login page (or shows recaptcha)
        if (html.toLowerCase().includes('<title>login</title>') || html.toLowerCase().includes('recaptcha')) {
            console.log("ReFlex Background: Session expired. Waiting for user to log in again.");
            return;
        }

        const marksData = await parseHtmlOffscreen(html);
        if (marksData && marksData.length > 0) {
            diffQueue = diffQueue.then(() => {
                return new Promise((resolveNext) => {
                    _robustDiffAndSave(marksData, (changedKeysSet) => {
                        if (changedKeysSet && changedKeysSet.size > 0) {
                            chrome.tabs.query({ url: "*://*.nu.edu.pk/*" }, (tabs) => {
                                tabs.forEach(tab => {
                                    chrome.tabs.sendMessage(tab.id, { action: 'NEW_MARKS_DATA' }).catch(() => {});
                                });
                            });
                        }
                        resolveNext();
                    });
                });
            });
        }

        // Wait, emails are now processed independently in the alarm listener!
    } catch (e) {
        console.error("ReFlex Background Error:", e);
    }
}

let offscreenSetupPromise = null;
let offscreenLockCount = 0;

async function ensureOffscreenDocument() {
    if (offscreenSetupPromise) {
        return offscreenSetupPromise;
    }
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existingContexts.length > 0) {
        return;
    }
    offscreenSetupPromise = chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DOM_PARSER'],
        justification: 'Parse university marks HTML string in the background'
    }).finally(() => {
        offscreenSetupPromise = null;
    });
    return offscreenSetupPromise;
}

async function parseHtmlOffscreen(html) {
    await ensureOffscreenDocument();
    offscreenLockCount++;
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'PARSE_MARKS', html: html }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("ReFlex Background: parseHtmlOffscreen error", chrome.runtime.lastError.message);
            }
            
            offscreenLockCount--;
            if (offscreenLockCount <= 0) {
                offscreenLockCount = 0;
                try {
                    chrome.offscreen.closeDocument();
                } catch (e) {}
            }
            
            if (response && response.success) {
                resolve(response.marksData);
            } else {
                resolve(null);
            }
        });
    });
}

const SCHEMA_VERSION = 2;
const SYNC_ITEM_LIMIT = 7500;

function buildSnapshotKey(courseName, catName, itemLabel) {
    return `${catName}||${itemLabel}`;
}

function _readStorage(callback) {
    chrome.storage.local.get(null, localStored => {
        if (chrome.runtime.lastError) localStored = {};
        try {
            chrome.storage.sync.get(['ff_badge_timestamps'], syncStored => {
                if (chrome.runtime.lastError) syncStored = {};
                const merged = { ...localStored };
                if (syncStored.ff_badge_timestamps) {
                    merged.ff_badge_timestamps = syncStored.ff_badge_timestamps;
                }
                callback(merged);
            });
        } catch (e) {
            callback(localStored);
        }
    });
}

function _migrateSnapsFromSync(localStored, onDone) {
    try {
        chrome.storage.sync.get(null, syncStored => {
            if (chrome.runtime.lastError || !syncStored) { onDone(localStored); return; }
            const snapKeys = Object.keys(syncStored).filter(k => k.startsWith(SNAP_PREFIX) || k === 'ff_schema_version');
            if (snapKeys.length === 0) { onDone(localStored); return; }
            
            const keysToRemove = [...snapKeys];
            if (syncStored.ff_badge_timestamps) keysToRemove.push('ff_badge_timestamps');
            
            const toLocal = {};
            snapKeys.forEach(k => { if (!(k in localStored)) toLocal[k] = syncStored[k]; });
            
            chrome.storage.sync.remove(keysToRemove, () => { if (chrome.runtime.lastError) {} });
            
            const merged = { ...localStored };
            Object.assign(merged, toLocal);
            delete merged.ff_badge_timestamps;
            
            if (Object.keys(toLocal).length > 0) chrome.storage.local.set(toLocal);
            onDone(merged);
        });
    } catch (e) {
        onDone(localStored);
    }
}

function _trimForSync(badges) {
    let json = JSON.stringify(badges);
    if (json.length <= SYNC_ITEM_LIMIT) return badges;

    const entries = Object.entries(badges).sort((a, b) => a[1].timestamp - b[1].timestamp);
    const trimmed = {};
    let currentLen = 2;
    
    for (let i = entries.length - 1; i >= 0; i--) {
        const keyStr = JSON.stringify(entries[i][0]);
        const valStr = JSON.stringify(entries[i][1]);
        const addedLen = keyStr.length + valStr.length + 1;
        const commaLen = Object.keys(trimmed).length === 0 ? 0 : 1;
        
        if (currentLen + addedLen + commaLen > SYNC_ITEM_LIMIT) break;
        
        trimmed[entries[i][0]] = entries[i][1];
        currentLen += addedLen + commaLen;
    }
    return trimmed;
}

function _robustDiffAndSave(marksData, callback) {
    _readStorage(localStored => {
        _migrateSnapsFromSync(localStored, allStored => {
            if (allStored.ff_schema_version !== SCHEMA_VERSION) {
                const keysToWipe = Object.keys(allStored).filter(k => k.startsWith(SNAP_PREFIX));
                keysToWipe.push('ff_badge_timestamps', 'ff_schema_version');
                chrome.storage.local.remove(keysToWipe);
                try {
                    chrome.storage.sync.remove(['ff_badge_timestamps', 'ff_schema_version'], () => { if (chrome.runtime.lastError) {} });
                } catch (e) {}
                allStored = {};
            }

            const hasExistingSnaps = Object.keys(allStored).some(k => k.startsWith(SNAP_PREFIX));
            const isFirstRun = !hasExistingSnaps;

            if (isFirstRun) {
                try { chrome.storage.sync.remove('ff_badge_timestamps', () => { if (chrome.runtime.lastError) {} }); } catch (e) {}
            }

            const localWrites = { ff_schema_version: SCHEMA_VERSION };
            const activeKeys = new Set(marksData.map(c => SNAP_PREFIX + c.courseName));

            const keysToRemove = Object.keys(allStored).filter(k => k.startsWith(SNAP_PREFIX) && !activeKeys.has(k));
            if (keysToRemove.length > 0) chrome.storage.local.remove(keysToRemove);

            const badgeTimestamps = isFirstRun ? {} : (allStored.ff_badge_timestamps || {});
            const now = Date.now();

            marksData.forEach(course => {
                const storeKey  = SNAP_PREFIX + course.courseName;
                const oldCourse = allStored[storeKey] || {};
                const newCourse = {};

                course.categories.forEach(cat => {
                    cat.items.forEach(item => {
                        const snapKey = buildSnapshotKey(course.courseName, cat.name, item.label);
                        const val     = `${item.obtained}|${item.total}`;
                        newCourse[snapKey] = val;

                        if (isFirstRun) return;

                        const uiKey = `${course.courseName}||${cat.name}||${item.label}`;
                        
                        if (!(snapKey in oldCourse)) {
                            badgeTimestamps[uiKey] = { type: 'NEW', timestamp: now };
                        } else {
                            let oldValStr = oldCourse[snapKey];
                            let [oldObtained, oldTotal] = oldValStr.split('|');
                            if (oldTotal === 'undefined') oldTotal = String(item.total);
                            const normalizedOldVal = `${oldObtained}|${oldTotal}`;

                            if (normalizedOldVal !== val) {
                                if (oldObtained === 'null' && item.obtained !== null) {
                                    badgeTimestamps[uiKey] = { type: 'NEW', timestamp: now };
                                } else {
                                    badgeTimestamps[uiKey] = { type: 'UPDATED', timestamp: now };
                                }
                            }
                        }
                    });
                });
                localWrites[storeKey] = newCourse;
            });

            const validUiKeys = new Set();
            marksData.forEach(course => {
                course.categories.forEach(cat => {
                    cat.items.forEach(item => {
                        validUiKeys.add(`${course.courseName}||${cat.name}||${item.label}`);
                    });
                });
            });

            for (const uiKey in badgeTimestamps) {
                if (!validUiKeys.has(uiKey)) {
                    delete badgeTimestamps[uiKey];
                } else if (now - badgeTimestamps[uiKey].timestamp > BADGE_EXPIRY_MS) {
                    delete badgeTimestamps[uiKey];
                }
            }

            const changed = new Set();
            const newUpdates = [];
            for (const uiKey in badgeTimestamps) {
                changed.add(uiKey + '|' + badgeTimestamps[uiKey].type);
                if (badgeTimestamps[uiKey].timestamp === now) {
                    newUpdates.push(`${uiKey.replace(/\|\|/g, ' > ')} (${badgeTimestamps[uiKey].type})`);
                }
            }

            if (newUpdates.length > 0 && !isFirstRun) {
                chrome.storage.local.get(['userEmail'], (res) => {
                    if (res.userEmail) {
                        queueEmailUpdates(newUpdates);
                    }
                });
            }

            chrome.storage.local.set(localWrites, () => {
                if (chrome.runtime.lastError) console.warn('ReFlex: Could not save snapshots.', chrome.runtime.lastError.message);
            });

            const syncBadges = _trimForSync(badgeTimestamps);
            try {
                chrome.storage.sync.set({ ff_badge_timestamps: syncBadges }, () => {
                    if (chrome.runtime.lastError) {
                        chrome.storage.local.set({ ff_badge_timestamps: badgeTimestamps });
                    }
                    callback(changed);
                });
            } catch (e) {
                chrome.storage.local.set({ ff_badge_timestamps: badgeTimestamps });
                callback(changed);
            }
        });
    });
}
