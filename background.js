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
    } else if (alarm.name === "emailQueueCheck") {
        processEmailQueue();
    }
});

let diffQueue = Promise.resolve();
let emailQueueChain = Promise.resolve();
let emailSendInFlight = false;

function storageLocalGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (res) => {
            if (chrome.runtime.lastError) {
                console.warn('ReFlex Background: Storage read failed.', chrome.runtime.lastError.message);
                resolve({});
                return;
            }
            resolve(res || {});
        });
    });
}

function storageLocalSet(values) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(values, () => {
            if (chrome.runtime.lastError) {
                console.warn('ReFlex Background: Storage write failed.', chrome.runtime.lastError.message);
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(true);
        });
    });
}

function storageLocalRemove(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.remove(keys, () => {
            if (chrome.runtime.lastError) {
                console.warn('ReFlex Background: Storage remove failed.', chrome.runtime.lastError.message);
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(true);
        });
    });
}

function runEmailQueueMutation(task) {
    const nextMutation = emailQueueChain.catch(() => {}).then(task);
    emailQueueChain = nextMutation.catch((e) => {
        console.error('ReFlex Background: Email queue mutation failed.', e);
    });
    return nextMutation;
}

// We can also allow the popup or content script to trigger actions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'silentBackgroundSync') {
        const now = Date.now();
        chrome.storage.local.get(['ff_last_silent_sync'], (res) => {
            const lastSync = res.ff_last_silent_sync || 0;
            if (now - lastSync > 15000) { // 15 seconds throttle
                chrome.storage.local.set({ ff_last_silent_sync: now });
                checkGradesInBackground();
            }
        });
        sendResponse({ status: "started_or_throttled" });
    } else if (request.action === 'triggerBackgroundCheck') {
        checkGradesInBackground();
        sendResponse({ status: "started" });
    } else if (request.action === 'syncSpecificSemester') {
        if (self.isManualSyncing) {
            sendResponse({ status: "locked" });
            return;
        }
        self.isManualSyncing = true;
        const sId = request.semId;
        (async () => {
            try {
                const reqTokenObj = await chrome.storage.local.get('ff_request_token');
                const token = reqTokenObj.ff_request_token || '';
                
                const postBody = new URLSearchParams();
                if (sId !== 'unknown') {
                    postBody.append('SemId', sId);
                }
                if (token) postBody.append('__RequestVerificationToken', token);
                
                const url = (sId === 'unknown') ? 'https://flexstudent.nu.edu.pk/Student/Marks' : 'https://flexstudent.nu.edu.pk/Student/StudentMarks';
                const options = {
                    method: sId === 'unknown' ? 'GET' : 'POST',
                    headers: sId === 'unknown' ? undefined : { 'Content-Type': 'application/x-www-form-urlencoded' }
                };
                if (sId !== 'unknown') options.body = postBody.toString();
                
                const res = await fetch(url, options);
                if (!res.ok) throw new Error('Fetch failed');
                const html = await res.text();
                const result = await parseHtmlOffscreen(html);
                const marksData = result?.marksData || result || [];
                
                diffQueue = diffQueue.then(() => {
                    return new Promise((resolveNext) => {
                        _robustDiffAndSave(marksData, sId, request.semName || sId, (changedKeysSet, allUpdates, hasRealChanges) => {
                            if (sender && sender.tab) {
                                chrome.tabs.sendMessage(sender.tab.id, {
                                    action: 'SYNC_COMPLETED',
                                    semId: sId,
                                    marksData: marksData
                                }).catch(() => {});
                            }
                            self.isManualSyncing = false;
                            resolveNext();
                        });
                    });
                }).catch(e => {
                    console.error('ReFlex Background: diffQueue recovered from syncSpecificSemester error:', e);
                    self.isManualSyncing = false;
                });
            } catch(e) {
                console.error("ReFlex Sync Error", e);
                if (sender && sender.tab) {
                    chrome.tabs.sendMessage(sender.tab.id, { action: 'SYNC_COMPLETED', error: true }).catch(() => {});
                }
                self.isManualSyncing = false;
            }
        })();
        sendResponse({ status: "started" });
    } else if (request.action === 'triggerEmailQueue') {
        processEmailQueue();
        sendResponse({ status: "started" });
    } else if (request.action === 'queueEmail') {
        queueEmailUpdates(request.updates);
        sendResponse({ status: "queued" });
    } else if (request.action === 'markAsRead') {
        processMarkAsRead(request.uiKeys, request.queueStrings, request.semesterId || 'unknown')
            .then(() => sendResponse({ status: "processed" }))
            .catch((e) => {
                console.error("ReFlex Background: Mark as read failed", e);
                sendResponse({ status: "failed" });
            });
        return true;
        } else if (request.action === 'processDiff') {
        const semId = request.semesterId || 'unknown';
        const semName = request.semesterName || semId;
        diffQueue = diffQueue.then(() => {
            return new Promise((resolveNext) => {
                try {
                    _robustDiffAndSave(request.marksData, semId, semName, (changedKeysSet, allUpdates) => {
                        sendResponse({ changedKeys: Array.from(changedKeysSet), allUpdates });
                        resolveNext();
                    });
                } catch (e) {
                    console.error("ReFlex Background: Diff failed", e);
                    sendResponse({ changedKeys: [], allUpdates: [] });
                    resolveNext();
                }
            });
        }).catch(e => console.error("ReFlex Background: diffQueue recovered from error:", e));
        return true; // Keep channel open for async
    } else if (request.action === 'PARSE_SEMESTER_HTML') {
        // Content script fetched a semester's HTML — parse it via offscreen
        parseHtmlOffscreen(request.html).then(result => {
            sendResponse(result || { marksData: null, semesterInfo: null });
        }).catch(e => {
            console.error('ReFlex Background: Semester HTML parse failed', e);
            sendResponse({ marksData: null, semesterInfo: null });
        });
        return true;
    }
});

function processMarkAsRead(uiKeys, queueStrings, semesterId) {
    uiKeys = Array.isArray(uiKeys) ? uiKeys : [];
    queueStrings = Array.isArray(queueStrings) ? queueStrings : [];

    // 1. Remove from Email Queue
    const queueRemoval = runEmailQueueMutation(async () => {
        const res = await storageLocalGet(['pending_email_queue']);
        if (res.pending_email_queue && res.pending_email_queue.length > 0) {
            const newQueue = res.pending_email_queue.filter(item => !queueStrings.includes(item));
            
            if (newQueue.length === 0) {
                // If queue is now empty, delete it and the timer
                await storageLocalRemove(['pending_email_queue', 'email_queue_start_time']);
            } else if (newQueue.length !== res.pending_email_queue.length) {
                await storageLocalSet({ pending_email_queue: newQueue });
            }
        }
    });

    // 2. Remove Badges from UI (prefix keys with semester)
    const badgeSemPrefix = semesterId + '::';
    const badgeRemoval = diffQueue = diffQueue.then(() => {
        return new Promise((resolve) => {
            _readStorage(allStored => {
                let badges = allStored.ff_badge_timestamps || {};
                let changed = false;
                
                uiKeys.forEach(key => {
                    // Try with semester prefix first, then raw key for backward compat
                    const prefixedKey = badgeSemPrefix + key;
                    if (badges[prefixedKey]) {
                        delete badges[prefixedKey];
                        changed = true;
                    } else if (badges[key]) {
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
    }).catch(e => { console.error('ReFlex Background: diffQueue recovered from error:', e); return Promise.resolve(); });

    return Promise.all([queueRemoval, badgeRemoval]);
}

function queueEmailUpdates(updatesArray) {
    if (!Array.isArray(updatesArray) || updatesArray.length === 0) return;

    runEmailQueueMutation(async () => {
        const res = await storageLocalGet(['pending_email_queue', 'email_queue_start_time']);
        let queue = res.pending_email_queue || [];
        let startTime = res.email_queue_start_time || Date.now();
        const wasEmpty = queue.length === 0;
        
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
            await storageLocalSet({ 
                pending_email_queue: queue,
                email_queue_start_time: wasEmpty ? Date.now() : startTime 
            });
            if (wasEmpty) {
                chrome.alarms.create('emailQueueCheck', { delayInMinutes: 30 });
            }
        }
    });
}

async function processEmailQueue() {
    if (emailSendInFlight) return;
    emailSendInFlight = true;

    try {
        let emailJob = null;
        await runEmailQueueMutation(async () => {
            const res = await storageLocalGet(['pending_email_queue', 'email_queue_start_time', 'userEmail']);
            if (!res.userEmail) return;
            if (res.pending_email_queue && res.pending_email_queue.length > 0) {
                // Check if 30 minutes have passed since the first item was queued (with a 60-second alarm buffer)
                if (Date.now() - res.email_queue_start_time >= (30 * 60 * 1000) - 60000) {
                    const itemsToSend = [...res.pending_email_queue];
                    emailJob = {
                        userEmail: res.userEmail,
                        messageStr: itemsToSend.join('<br>'),
                        itemsToSend
                    };
                }
            }
        });

        if (!emailJob) return;

        await sendEmailSecurely(emailJob.userEmail, emailJob.messageStr, emailJob.itemsToSend);
    } finally {
        emailSendInFlight = false;
    }
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

function getValidTokenPromise() {
    return new Promise((resolve) => getValidToken(resolve));
}

async function sendEmailSecurely(userEmail, messageStr, itemsSent) {
    const token = await getValidTokenPromise();
        if (!token) {
            console.error("ReFlex Background: Could not get auth token for email. User might be logged out.");
            chrome.storage.local.get(['email_auth_notified_time'], (res) => {
                const lastNotified = res.email_auth_notified_time || 0;
                if (Date.now() - lastNotified > 12 * 60 * 60 * 1000) { // 12 hours cooldown
                    chrome.storage.local.set({ email_auth_notified_time: Date.now() });
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'reflex-icon-128.png',
                        title: 'ReFlex Email Alert',
                        message: 'Failed to send email: Your Google session expired. Please open the ReFlex popup to log in again.'
                    });
                }
            });
            return { ok: false, reason: 'missing-token' };
        }
        
    try {
        const r = await fetch('https://reflex-notifier.shayanasim-dev.workers.dev/api/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ email: userEmail, message: messageStr })
        });

            if (!r.ok) {
                const errText = await r.text();
                console.error("ReFlex Background: Email Failed!", errText);
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'reflex-icon-128.png',
                    title: 'ReFlex Email Failed',
                    message: 'Server error: ' + errText
                });
                return { ok: false, reason: 'server-error' };
            } else {
                console.log("ReFlex Background: Email Sent successfully!");
                // Clear ONLY the items we just successfully sent, protecting new items that arrived during the fetch
                await runEmailQueueMutation(async () => {
                    const qRes = await storageLocalGet(['pending_email_queue']);
                    let currentQueue = qRes.pending_email_queue || [];
                    let sentSet = new Set(itemsSent);
                    let remainingQueue = currentQueue.filter(item => !sentSet.has(item));
                    
                    if (remainingQueue.length > 0) {
                        // Keep new items that arrived, but reset the timer so they wait their own 2 mins
                        await storageLocalSet({ 
                            pending_email_queue: remainingQueue,
                            email_queue_start_time: Date.now()
                        });
                    } else {
                        await storageLocalRemove(['pending_email_queue', 'email_queue_start_time']);
                    }
                });
                return { ok: true };
            }
    } catch (e) {
        console.error(e);
        return { ok: false, reason: 'network-error' };
    }
}

async function checkGradesInBackground() {
    try {
        const res = await fetch('https://flexstudent.nu.edu.pk/Student/Marks');
        if (!res.ok) return;

        const html = await res.text();
        
        let requestToken = '';
        const tokenMatch = html.match(/<input[^>]+name="__RequestVerificationToken"[^>]+value="([^"]+)"/i) || html.match(/<input[^>]+value="([^"]+)"[^>]+name="__RequestVerificationToken"/i);
        if (tokenMatch && tokenMatch[1]) {
            requestToken = tokenMatch[1];
        }
        
        // If the session expired, it redirects to the login page (or shows recaptcha)
        if (html.toLowerCase().includes('<title>login</title>') || html.toLowerCase().includes('recaptcha')) {
            console.log("ReFlex Background: Session expired. Waiting for user to log in again.");
            return;
        }

        const result = await parseHtmlOffscreen(html);
        const marksData = result?.marksData || result;  // Handle both new {marksData, semesterInfo} and legacy array format
        const semesterInfo = result?.semesterInfo || null;
        const defaultSemId = semesterInfo?.selectedId || 'unknown';
        const defaultSemName = semesterInfo?.selectedName || 'Current Semester';

        const processSemester = (mData, sId, sName) => {
            if (!mData || mData.length === 0) {
                console.log('ReFlex Background: Semester', sId, 'has no data. Skipping diff.');
                return;
            }
            diffQueue = diffQueue.then(() => {
                return new Promise((resolveNext) => {
                    _robustDiffAndSave(mData, sId, sName, (changedKeysSet, allUpdates, hasRealChanges) => {
                        if (hasRealChanges) {
                            chrome.tabs.query({ url: "*://flexstudent.nu.edu.pk/*" }, (tabs) => {
                                tabs.forEach(tab => {
                                    chrome.tabs.sendMessage(tab.id, { action: 'NEW_MARKS_DATA', semId: sId, marksData: mData }).catch(() => {});
                                });
                            });
                        }
                        resolveNext();
                    });
                });
            }).catch(e => console.error('ReFlex Background: diffQueue recovered from error:', e));
        };

        // 1. Process the default semester
        processSemester(marksData, defaultSemId, defaultSemName);

        // 2. Process the previous semester ONLY if the current one is completely empty (no courses).
        // This optimizes performance because previous semesters don't get updates once the new one starts.
        if (semesterInfo && semesterInfo.options && (!marksData || marksData.length === 0)) {
            const defaultIdx = semesterInfo.options.findIndex(opt => opt.id === defaultSemId);
            if (defaultIdx !== -1 && defaultIdx + 1 < semesterInfo.options.length) {
                const prevSemOpt = semesterInfo.options[defaultIdx + 1];
                try {
                    const postBody = new URLSearchParams();
                    postBody.append('SemId', prevSemOpt.id);
                    if (requestToken) {
                        postBody.append('__RequestVerificationToken', requestToken);
                    }
                    
                    const oldRes = await fetch('https://flexstudent.nu.edu.pk/Student/StudentMarks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: postBody.toString()
                    });
                    
                    if (oldRes.ok) {
                        const oldHtml = await oldRes.text();
                        const oldResult = await parseHtmlOffscreen(oldHtml);
                        const oldMarksData = oldResult?.marksData || oldResult;
                        processSemester(oldMarksData, prevSemOpt.id, prevSemOpt.name);
                    }
                } catch (err) {
                    console.error("ReFlex Background: Failed fetching older semester", prevSemOpt.id, err);
                }
            }
        }
    } catch (e) {
        console.error("ReFlex Background Error:", e);
    }
}

// Expose to global scope for manual debugging in the console
self.checkGradesInBackground = checkGradesInBackground;

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
                resolve({ marksData: response.marksData, semesterInfo: response.semesterInfo || null });
            } else {
                resolve(null);
            }
        });
    });
}

const SCHEMA_VERSION = 3;
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

function _robustDiffAndSave(marksData, semesterId, semesterName, callback) {
    _readStorage(localStored => {
        _migrateSnapsFromSync(localStored, allStored => {
            try {
                if (allStored.ff_schema_version !== SCHEMA_VERSION) {
                // Schema upgrade (v2→v3): wipe all old semester-blind snapshots
                const keysToWipe = Object.keys(allStored).filter(k => k.startsWith(SNAP_PREFIX));
                keysToWipe.push('ff_badge_timestamps', 'ff_schema_version');
                chrome.storage.local.remove(keysToWipe);
                try {
                    chrome.storage.sync.remove(['ff_badge_timestamps', 'ff_schema_version'], () => { if (chrome.runtime.lastError) {} });
                } catch (e) {}
                allStored = {};
            }

            // Semester-scoped prefix: ff_snap_{semId}__{courseName}
            const semPrefix = SNAP_PREFIX + semesterId + '__';

            const hasExistingSnaps = Object.keys(allStored).some(k => k.startsWith(semPrefix));
            const isFirstRun = !hasExistingSnaps;

            if (isFirstRun) {
                // Don't clear ALL badges — only clear badges for THIS semester on first run
                // Other semesters' badges are preserved
            }

            const localWrites = { ff_schema_version: SCHEMA_VERSION };
            // Only manage keys within THIS semester (don't touch other semesters)
            const activeKeys = new Set(marksData.map(c => semPrefix + c.courseName));

            const keysToRemove = Object.keys(allStored).filter(k => k.startsWith(semPrefix) && !activeKeys.has(k));
            if (keysToRemove.length > 0) chrome.storage.local.remove(keysToRemove);

            const badgeTimestamps = allStored.ff_badge_timestamps || {};
            const now = Date.now();

            // Badge key prefix for this semester
            const badgeSemPrefix = semesterId + '::';

            marksData.forEach(course => {
                const storeKey  = semPrefix + course.courseName;
                const oldCourse = allStored[storeKey] || {};
                const newCourse = {};

                course.categories.forEach(cat => {
                    cat.items.forEach(item => {
                        const snapKey = buildSnapshotKey(course.courseName, cat.name, item.label);
                        const val     = `${item.obtained}|${item.total}`;
                        newCourse[snapKey] = val;

                        if (isFirstRun) return;

                        const uiKey = `${badgeSemPrefix}${course.courseName}||${cat.name}||${item.label}`;
                        
                        if (!(snapKey in oldCourse)) {
                            // Only trigger a NEW badge/email if the item actually has grades.
                            // Empty placeholders (-/20) shouldn't spam the user.
                            if (item.obtained !== null) {
                                badgeTimestamps[uiKey] = { type: 'NEW', timestamp: now, semName: semesterName || semesterId };
                            }
                        } else {
                            let oldValStr = oldCourse[snapKey];
                            let [oldObtained, oldTotal] = oldValStr.split('|');
                            if (oldTotal === 'undefined') oldTotal = String(item.total);
                            const normalizedOldVal = `${oldObtained}|${oldTotal}`;

                            if (normalizedOldVal !== val) {
                                if (oldObtained === 'null' && item.obtained !== null) {
                                    badgeTimestamps[uiKey] = { type: 'NEW', timestamp: now, semName: semesterName || semesterId };
                                } else {
                                    badgeTimestamps[uiKey] = { type: 'UPDATED', timestamp: now, semName: semesterName || semesterId };
                                }
                            }
                        }
                    });
                });
                localWrites[storeKey] = newCourse;
            });

            // Build valid keys for THIS semester only
            const validUiKeys = new Set();
            marksData.forEach(course => {
                course.categories.forEach(cat => {
                    cat.items.forEach(item => {
                        validUiKeys.add(`${badgeSemPrefix}${course.courseName}||${cat.name}||${item.label}`);
                    });
                });
            });

            // Only prune badges belonging to THIS semester
            for (const uiKey in badgeTimestamps) {
                if (!uiKey.startsWith(badgeSemPrefix)) continue; // Leave other semesters' badges alone
                if (!validUiKeys.has(uiKey)) {
                    delete badgeTimestamps[uiKey];
                } else if (now - badgeTimestamps[uiKey].timestamp > BADGE_EXPIRY_MS) {
                    delete badgeTimestamps[uiKey];
                }
            }

            const changed = new Set();
            const newUpdates = [];
            const allUpdates = [];
            
            for (const uiKey in badgeTimestamps) {
                // If it belongs to THIS semester, build 'changed' set for legacy callback compatibility
                if (uiKey.startsWith(badgeSemPrefix)) {
                    const displayKey = uiKey.substring(badgeSemPrefix.length);
                    changed.add(displayKey + '|' + badgeTimestamps[uiKey].type);
                    if (badgeTimestamps[uiKey].timestamp === now) {
                        const sName = badgeTimestamps[uiKey].semName || semesterName || semesterId;
                        newUpdates.push(`[${sName}] ${displayKey.replace(/\|\|/g, ' > ')} (${badgeTimestamps[uiKey].type})`);
                    }
                }
                
                // Build allUpdates for all semesters
                const firstColon = uiKey.indexOf('::');
                if (firstColon === -1) continue; // Skip malformed
                const semId = uiKey.substring(0, firstColon);
                const rest = uiKey.substring(firstColon + 2);
                const parts = rest.split('||');
                if (parts.length !== 3) continue;
                
                const courseName = parts[0];
                const catName = parts[1];
                const itemLabel = parts[2];
                
                const snapKey = `${SNAP_PREFIX}${semId}__${courseName}`;
                // Fallback to localWrites for just-created snapshots, or allStored for older ones
                const courseObj = localWrites[snapKey] || allStored[snapKey] || {};
                const itemSnapKey = `${catName}||${itemLabel}`;
                const valStr = courseObj[itemSnapKey] || "";
                let obtained = null, total = null;
                if (valStr) {
                    const valParts = valStr.split('|');
                    obtained = valParts[0] === 'null' ? null : parseFloat(valParts[0]);
                    total = valParts[1] === 'undefined' ? null : parseFloat(valParts[1]);
                }
                
                const codeMatch = courseName.match(/^([A-Z]{2,4}\d{4})/i);
                const courseCode = codeMatch ? codeMatch[1] : courseName.substring(0, 7);
                const sName = badgeTimestamps[uiKey].semName || (uiKey.startsWith(badgeSemPrefix) ? (semesterName || semesterId) : semId);
                
                allUpdates.push({
                    semId,
                    semName: sName,
                    courseCode,
                    fullCourseName: courseName,
                    catName,
                    item: { label: itemLabel, obtained, total },
                    type: badgeTimestamps[uiKey].type,
                    courseKey: uiKey,
                    queueString: `[${sName}] ${rest.replace(/\|\|/g, ' > ')} (${badgeTimestamps[uiKey].type})`
                });
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
                    callback(changed, allUpdates, newUpdates.length > 0);
                });
                } catch (e) {
                    try {
                        chrome.storage.local.set({ ff_badge_timestamps: badgeTimestamps });
                    } catch(err){}
                    callback(changed, allUpdates, newUpdates.length > 0);
                }
            } catch (syncError) {
                console.error("ReFlex Background: Ghost freeze caught in _robustDiffAndSave", syncError);
                callback(new Set(), [], false);
            }
        });
    });
}
