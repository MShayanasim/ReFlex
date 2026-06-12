chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PARSE_MARKS') {
        try {
            // Parse raw HTML string into a DOM Document
            const parser = new DOMParser();
            const doc = parser.parseFromString(request.html, 'text/html');

            // ── Extract semester info from native dropdown ──
            let semesterInfo = null;
            const semSelect = doc.querySelector('select#SemId');
            if (semSelect) {
                const options = Array.from(semSelect.querySelectorAll('option')).map(opt => ({
                    id: opt.value,
                    name: opt.textContent.trim()
                }));
                const selectedOpt = semSelect.querySelector('option[selected]') || semSelect.options[semSelect.selectedIndex];
                semesterInfo = {
                    options,
                    selectedId: selectedOpt ? selectedOpt.value : (options[0]?.id || null),
                    selectedName: selectedOpt ? selectedOpt.textContent.trim() : (options[0]?.name || null)
                };
            }

            const tables = doc.querySelectorAll('table');
            let marksData = [];

            tables.forEach(table => {
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

                for (let i = headerRowIdx + 1; i < rows.length; i++) {
                    const row = rows[i];
                    const cells = row.querySelectorAll('td, th, .m-datatable__cell');
                    if (cells.length === 0) continue;

                    const rowText = row.textContent.trim().toLowerCase();
                    if (rowText.includes('grand total')) continue;

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
                            
                            // Try to extract weightage from category name, e.g., "Quizzes (10%)" or "Assignments (15 Marks)"
                            const wtMatch = catName.match(/\(\s*(\d+(?:\.\d+)?)\s*(?:%|weightage|wt|marks)?\s*\)/i);
                            if (wtMatch) {
                                currentCat.givenWeightage = parseFloat(wtMatch[1]);
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
                    
                    // Check for category Total row to extract given weightage
                    if (label.toLowerCase() === 'total' || rowText === 'total') {
                        if (currentCat) {
                            const cellsArr = Array.from(cells);
                            const totalWt = getNumOrNull('weightage', cellsArr);
                            if (totalWt > 0 && !currentCat.givenWeightage) {
                                currentCat.givenWeightage = totalWt;
                            }
                        }
                        continue;
                    }

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

            marksData = marksData.filter(c => c.categories.length > 0);

            // ── Grand Total extraction (same logic as runMarks.js) ──
            const gtRows = doc.querySelectorAll('tr.GrandtotalColumn');
            gtRows.forEach(gtRow => {
                if (!gtRow.textContent.trim().match(/\d/)) return;
                let targetCourse = null;
                const gtContainer = gtRow.closest('[id$="-Grand_Total_Marks"]') ||
                                    gtRow.closest('table')?.closest('[id$="-Grand_Total_Marks"]');
                if (gtContainer) {
                    const code = gtContainer.id.split('-')[0].trim();
                    targetCourse = marksData.find(c => c.courseName.includes(code));
                }
                if (!targetCourse && marksData.length > 0) {
                    targetCourse = marksData[marksData.length - 1];
                }
                if (!targetCourse) return;

                const tds = Array.from(gtRow.querySelectorAll('td'));
                const extractVal = (className, idx) => {
                    const el = gtRow.querySelector('.' + className);
                    const text = (el || tds[idx])?.textContent.trim() || '';
                    const match = text.match(/[-+]?[0-9]*\.?[0-9]+/);
                    return match ? parseFloat(match[0]) : null;
                };
                targetCourse.grandTotal = {
                    totalMarks:    extractVal('GrandtotalColMarks', 0),
                    obtainedMarks: extractVal('GrandtotalObtMarks', 1),
                    classAverage:  extractVal('GrandtotalClassAvg', 2),
                    min:           extractVal('GrandtotalClassMin', 3),
                    max:           extractVal('GrandtotalClassMax', 4),
                    stdDev:        extractVal('GrandtotalClassStdDev', 5) || extractVal('GrandtotalClassStd', 5)
                };
            });

            sendResponse({ success: true, marksData, semesterInfo });
        } catch (e) {
            sendResponse({ success: false, error: e.toString() });
        }
    }
    return true; // Keep channel open for async
});
