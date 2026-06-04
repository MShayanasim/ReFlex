chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PARSE_MARKS') {
        try {
            // Parse raw HTML string into a DOM Document
            const parser = new DOMParser();
            const doc = parser.parseFromString(request.html, 'text/html');

            const tables = doc.querySelectorAll('table');
            let marksData = [];

            tables.forEach(table => {
                const rows = Array.from(table.querySelectorAll('tr'));

                let headerRowIdx = -1;
                let hCells = [];
                let hCellsOrig = [];
                for (let i = 0; i < rows.length; i++) {
                    const cellsOrig = Array.from(rows[i].querySelectorAll('th, td')).map(c => c.textContent.trim());
                    const cells = cellsOrig.map(c => c.toLowerCase());
                    if (cells.includes('weightage') && (cells.includes('obtained marks') || cells.includes('obtained'))) {
                        headerRowIdx = i;
                        hCells = cells;
                        hCellsOrig = cellsOrig;
                        break;
                    }
                }
                if (headerRowIdx === -1) return;

                let courseName = '';
                let node = table.parentElement;
                for (let i = 0; i < 10 && node && !courseName; i++) {
                    let sib = node.previousElementSibling;
                    for (let j = 0; j < 5 && sib && !courseName; j++) {
                        const txt = sib.textContent.trim();
                        if (txt.length < 200 && /[A-Z]{2,4}\d{4}/i.test(txt)) {
                            courseName = txt.replace(/Cr\.?\s*Att.*/i, '').trim();
                        }
                        sib = sib.previousElementSibling;
                    }
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

                const getNumOrNull = (name, cells) => {
                    const idx = hCells.indexOf(name);
                    if (idx === -1) return null;
                    const text = cells[idx]?.textContent.trim();
                    if (!text || text === '-') return null;
                    const val = parseFloat(text);
                    return isNaN(val) ? null : val;
                };
                const getText = (name, cells) => {
                    const idx = hCells.indexOf(name);
                    return idx !== -1 ? (cells[idx]?.textContent.trim() || null) : null;
                };

                for (let i = headerRowIdx + 1; i < rows.length; i++) {
                    const row = rows[i];
                    const cells = row.querySelectorAll('td, th');
                    if (cells.length === 0) continue;

                    const rowText = row.textContent.trim().toLowerCase();
                    if (rowText.includes('grand total') || rowText === 'total') continue;

                    if (cells.length === 1 || (cells[0].hasAttribute('colspan') && cells.length < 4) || !row.textContent.match(/\d/)) {
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
                        let fallbackName = 'Assessments';
                        if (hCellsOrig.length > 0 && hCellsOrig[0]) {
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
                    const obtained = getNumOrNull('obtained marks', cellsArr) ?? getNumOrNull('obtained', cellsArr);
                    const total    = getNumOrNull('total marks', cellsArr);
                    const avg      = getNumOrNull('average', cellsArr);
                    const minMarks = getText('minimum', cellsArr);
                    const maxMarks = getText('maximum', cellsArr);

                    currentCat.items.push({ label, weight, obtained, total, avg, min: minMarks, max: maxMarks });
                }

                courseData.categories = courseData.categories.filter(c => c.items.length > 0);
            });

            marksData = marksData.filter(c => c.categories.length > 0);
            sendResponse({ success: true, marksData: marksData });
        } catch (e) {
            sendResponse({ success: false, error: e.toString() });
        }
    }
    return true; // Keep channel open for async
});
