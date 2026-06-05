(function() {
    'use strict';
    function runMarks(isSilent = false) {
        try {
            if (window._ffBackgroundMarksCache && !location.search.includes('ff_sync=1')) {
                const marksData = window._ffBackgroundMarksCache;
                if (window.ffDiffAndSave) {
                    window.ffDiffAndSave(marksData, changedKeys => {
                        if (isSilent && window.updateGrandTotalCardsInDOM) window.updateGrandTotalCardsInDOM(marksData);
                        else if (window.renderMarksDashboard) window.renderMarksDashboard(marksData, changedKeys);
                    });
                } else {
                    if (isSilent && window.updateGrandTotalCardsInDOM) window.updateGrandTotalCardsInDOM(marksData);
                    else if (window.renderMarksDashboard) window.renderMarksDashboard(marksData, new Set());
                }
                return;
            }

    const tables = document.querySelectorAll('table, .m-datatable');
    let marksData = [];
    let lastCourseData = null;

    tables.forEach(table => {
        // ── FAST PATH: Grand Final Marks via explicit class names ──
        // Responsive tables often have duplicate hidden rows that are empty. Find the one with text.
        const gtRows = Array.from(table.querySelectorAll('tr.GrandtotalColumn'));
        const gtRow = gtRows.find(r => r.textContent.trim().match(/\d/)) || gtRows[0];
        
        if (gtRow) {
            // Track the exact text so we can re-extract if staggered lazy loading updates the rest of the cells
            if (gtRow.textContent.trim().match(/\d/)) {
                gtRow.dataset.ffLastText = gtRow.textContent.trim();
            }

            let targetCourse = lastCourseData || (marksData.length > 0 ? marksData[marksData.length - 1] : null);
            
            // Try to precisely match course using the container ID (e.g., "SL1014-Grand_Total_Marks")
            const gtContainer = table.closest('[id$="-Grand_Total_Marks"]');
            if (gtContainer) {
                const code = gtContainer.id.split('-')[0].trim();
                const matchedCourse = marksData.find(c => c.courseName.includes(code));
                if (matchedCourse) targetCourse = matchedCourse;
            }

            if (targetCourse) {
                const tds = Array.from(gtRow.querySelectorAll('td'));
                const extractVal = (className, idx) => {
                    const el = gtRow.querySelector(`.${className}`);
                    const text = (el || tds[idx])?.textContent.trim() || '';
                    const match = text.match(/[-+]?[0-9]*\.?[0-9]+/);
                    return match ? parseFloat(match[0]) : null;
                };

                const newGt = {
                    totalMarks: extractVal('GrandtotalColMarks', 0),
                    obtainedMarks: extractVal('GrandtotalObtMarks', 1),
                    classAverage: extractVal('GrandtotalClassAvg', 2),
                    min: extractVal('GrandtotalClassMin', 3),
                    max: extractVal('GrandtotalClassMax', 4),
                    stdDev: extractVal('GrandtotalClassStdDev', 5) || extractVal('GrandtotalClassStd', 5) // Handle both class names
                };

                // Protect against duplicate empty responsive tables overwriting valid data
                if (!targetCourse.grandTotal || Object.values(newGt).some(v => v !== null)) {
                    targetCourse.grandTotal = newGt;
                }
            }
            return; // Move to the next table!
        }

        const rows = Array.from(table.querySelectorAll('tr, .m-datatable__row'));

        // Find the header row (must have weightage + obtained)
        let headerRowIdx = -1;
        let hCells = [];
        let hCellsOrig = [];
        let isGrandTotalTable = false;
        
        for (let i = 0; i < rows.length; i++) {
            const cellsOrig = Array.from(rows[i].querySelectorAll('th, td, .m-datatable__cell'))
                .map(c => c.textContent.trim());
            // Remove punctuation and normalize spaces
            const cells = cellsOrig.map(c => c.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '').replace(/\s+/g, ' '));
            if (cells.some(c => c.includes('weightage')) &&
                cells.some(c => c.includes('obtained'))) {
                headerRowIdx = i;
                hCells = cells;
                hCellsOrig = cellsOrig;
                break;
            } else if (cells.some(c => c.includes('class average') || c.includes('class avg')) && 
                       cells.some(c => (c.includes('std') && c.includes('dev')) || c.includes('standard deviation'))) {
                headerRowIdx = i;
                hCells = cells;
                hCellsOrig = cellsOrig;
                isGrandTotalTable = true;
                break;
            }
        }
        if (headerRowIdx === -1) return;

        // ── Course name: walk UP the DOM looking for a heading with a course code ──
        let courseName = '';
        let node = table.parentElement;
        for (let i = 0; i < 10 && node && !courseName; i++) {
            // Check previous siblings of each ancestor for a heading with course code
            let sib = node.previousElementSibling;
            for (let j = 0; j < 5 && sib && !courseName; j++) {
                const txt = sib.textContent.trim();
                if (txt.length < 200 && /[A-Z]{2,4}\d{4}/i.test(txt)) {
                    courseName = txt.replace(/Cr\.?\s*Att.*/i, '').trim();
                }
                sib = sib.previousElementSibling;
            }
            // Check headings within parent
            if (!courseName) {
                const headings = node.querySelectorAll('h1,h2,h3,h4,h5');
                for (const h of headings) {
                    const txt = h.textContent.trim();
                    if (txt.length < 200 && /[A-Z]{2,4}\d{4}/i.test(txt)) {
                        courseName = txt.replace(/Cr\.?\s*Att.*/i, '').trim();
                        break;
                    }
                }
            }
            node = node.parentElement;
        }
        // Last resort: portlet head text
        if (!courseName) {
            const portlet = table.closest('.m-portlet');
            const headEl = portlet && portlet.querySelector('.m-portlet__head-text');
            courseName = headEl ? headEl.textContent.trim() : `Unknown Course ${marksData.length + 1}`;
        }

        let courseData = marksData.find(c => c.courseName === courseName);
        if (!courseData) {
            courseData = { courseName, categories: [] };
            marksData.push(courseData);
        }
        let currentCat = null;
        let nameCounts = {};

        const getNumOrNull = (names, cells) => {
            if (!Array.isArray(names)) names = [names];
            const idx = hCells.findIndex(c => names.some(n => c.includes(n)));
            if (idx === -1) return null;
            const text = cells[idx]?.textContent.trim();
            if (!text || text === '-') return null;
            const match = text.match(/[-+]?[0-9]*\.?[0-9]+/);
            if (!match) return null;
            const val = parseFloat(match[0]);
            return isNaN(val) ? null : val;
        };
        const getText = (names, cells) => {
            if (!Array.isArray(names)) names = [names];
            const idx = hCells.findIndex(c => names.some(n => c.includes(n)));
            return idx !== -1 ? (cells[idx]?.textContent.trim() || null) : null;
        };

        // (The legacy text-based fallback for isGrandTotalTable is removed since we now use the explicit class match above)


        lastCourseData = courseData;

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            const cells = row.querySelectorAll('td, th, .m-datatable__cell');
            if (cells.length === 0) continue;

            const rowText = row.textContent.trim().toLowerCase();
            if (rowText.includes('grand total') || rowText === 'total') continue;

            // Category header row (colspan or very few cells with no numbers)
            if (cells.length === 1 ||
                (cells[0].hasAttribute('colspan') && cells.length < 4) ||
                !row.textContent.match(/\d/)) {
                const catName = cells[0].textContent.trim();
                if (catName.toLowerCase() !== 'total') {
                    let existing = courseData.categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
                    if (existing) {
                        currentCat = existing;
                    } else {
                        currentCat = { name: catName, items: [] };
                        courseData.categories.push(currentCat);
                    }
                }
                continue;
            }

            if (!currentCat) {
                // Determine category name from the first column header of this specific table
                let fallbackName = 'Assessments';
                if (hCellsOrig.length > 0 && hCellsOrig[0]) {
                    // E.g. "Assignment #", "Quiz No.", "Project Title" -> "Assignment", "Quiz", "Project"
                    fallbackName = hCellsOrig[0].replace(/\s*(#|No\.?|Title)$/i, '').trim() || 'Assessments';
                }

                let existing = courseData.categories.find(c => c.name.toLowerCase() === fallbackName.toLowerCase());
                if (existing) {
                    currentCat = existing;
                } else {
                    currentCat = { name: fallbackName, items: [] };
                    courseData.categories.push(currentCat);
                }
            }

            let label = cells[0]?.textContent.trim() || 'Item';
            if (label.toLowerCase() === 'total') continue;

            // Handle duplicate names
            if (nameCounts[label]) {
                nameCounts[label]++;
                label = `${label} #${nameCounts[label]}`;
            } else {
                nameCounts[label] = 1;
            }

            const cellsArr = Array.from(cells);
            const weight   = getNumOrNull('weightage', cellsArr) || 0;
            const obtained = getNumOrNull(['obtained marks', 'obtained'], cellsArr);
            const total    = getNumOrNull(['total marks', 'total'], cellsArr);
            const avg      = getNumOrNull('average', cellsArr);
            const minMarks = getText(['min', 'minimum'], cellsArr);
            const maxMarks = getText(['max', 'maximum'], cellsArr);

            currentCat.items.push({ label, weight, obtained, total, avg, min: minMarks, max: maxMarks });
        }

        // Clean up empty categories if any
        courseData.categories = courseData.categories.filter(c => c.items.length > 0);
    });

    // Remove courses with no valid categories
    marksData = marksData.filter(c => c.categories.length > 0);

    if (marksData.length === 0) return;

    if (location.search.includes('ff_sync=1')) {
        // We are in the hidden sync iframe!
        // The data is fully extracted. Send it to parent and stop.
        window.parent.postMessage({ type: 'FF_SYNC_COMPLETE', marksData }, window.location.origin);
        return;
    }

    if (window.ffDiffAndSave) {
        window.ffDiffAndSave(marksData, changedKeys => {
            if (isSilent && window.updateGrandTotalCardsInDOM) {
                window.updateGrandTotalCardsInDOM(marksData);
            } else {
                if (window.renderMarksDashboard) window.renderMarksDashboard(marksData, changedKeys);
            }
        });
    } else {
        if (isSilent && window.updateGrandTotalCardsInDOM) {
            window.updateGrandTotalCardsInDOM(marksData);
        } else {
            if (window.renderMarksDashboard) window.renderMarksDashboard(marksData, new Set());
        }
    }
        } catch (e) {
            if (e.message && e.message.includes('Extension context invalidated')) {
                console.warn('ReFlex updated in the background. Auto-refreshing to restore context.');
                return location.reload();
            }
            const errDiv = document.createElement('div');
            errDiv.style = "position: fixed; top: 0; left: 0; width: 100%; background: #ef4444; color: white; z-index: 999999; padding: 20px; font-family: monospace; white-space: pre-wrap;";
            errDiv.textContent = "ReFlex Marks Error:\n" + e.stack;
            document.body.appendChild(errDiv);
        }
    }
    
    window.ffRunMarks = runMarks;
    window.runMarks = runMarks;
    // --- END OF runMarks FUNCTION ---

    // ── FALLBACK POLLER FOR ANGULAR'S GRAND TOTAL LAZY LOADING ──
    if (!window.ffGtPoller) {
        window.ffGtPoller = setInterval(() => {
            if (!location.href.toLowerCase().includes('marks')) return;
            
            // ── FORCE LAZY LOAD: Automatically click the native accordion to fetch data ──
            // Angular takes a moment to bind click listeners. Give it 2.5 seconds to settle.
            if (!window.ffAngularReady) {
                if (!window.ffStartTime) window.ffStartTime = Date.now();
                if (Date.now() - window.ffStartTime > 2500) {
                    window.ffAngularReady = true;
                } else {
                    return; // Wait for it...
                }
            }

            // STRATEGY 1: Text-based heuristic (highly reliable for custom UI structures)
            const possibleToggles = Array.from(document.querySelectorAll('a, button, h3, h4, h5, span, div.m-portlet__head-text, .m-portlet__head, .accordion-toggle'));
            possibleToggles.forEach(el => {
                const text = el.textContent.trim().toLowerCase();
                // If the element says "Grand Total Marks" and isn't a massive container
                if (text.includes('grand total') && text.length < 40) {
                    if (!el.dataset.ffAutoClicked) {
                        el.dataset.ffAutoClicked = 'true';
                        try {
                            el.click();
                            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                            if (typeof window.$ !== 'undefined') window.$(el).trigger('click');
                        } catch(e) {}
                    }
                }
            });

            // STRATEGY 2: Container-based DOM traversal (fallback)
            document.querySelectorAll('[id$="-Grand_Total_Marks"]').forEach(container => {
                const portlet = container.closest('.m-portlet') || container;
                if (!portlet.dataset.ffAutoClickedFallback) {
                    portlet.dataset.ffAutoClickedFallback = 'true';
                    
                    const toggles = [
                        portlet.querySelector('[data-portlet-tool="toggle"]'),
                        portlet.querySelector('a.m-portlet__nav-link'),
                        portlet.previousElementSibling
                    ];
                                   
                    toggles.forEach(t => {
                        if (t) {
                            try { 
                                t.click(); 
                                t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                                t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                                if (typeof window.$ !== 'undefined') window.$(t).trigger('click');
                            } catch(e) {}
                        }
                    });
                }
            });

            // Strategy 3 (Inline Script Injection) removed due to strict CSP blocking inline scripts.
            // Strategies 1 and 2 are sufficient for triggering Angular clicks.

            const gtRows = document.querySelectorAll('tr.GrandtotalColumn');
            let foundNewData = false;
            
            gtRows.forEach(row => {
                const currentText = row.textContent.trim();
                if (currentText.match(/\d/) && row.dataset.ffLastText !== currentText) {
                    foundNewData = true;
                }
            });
            
            if (foundNewData) {
                if (window.ffRunMarks) window.ffRunMarks(true);
            }

            // In sync mode, forcibly run after 4.5 seconds to guarantee transmission even if no data changed
            if (location.search.includes('ff_sync=1') && !window.ffSyncSent) {
                if (Date.now() - window.ffStartTime > 4500) {
                    window.ffSyncSent = true;
                    if (window.ffRunMarks) window.ffRunMarks(true);
                }
            }
        }, 800); // Check every 800ms 
    }

})();
