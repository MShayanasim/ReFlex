(function() {
    'use strict';
    function runMarks() {
    const tables = document.querySelectorAll('table');
    let marksData = [];

    tables.forEach(table => {
        const rows = Array.from(table.querySelectorAll('tr'));

        // Find the header row (must have weightage + obtained)
        let headerRowIdx = -1;
        let hCells = [];
        let hCellsOrig = [];
        for (let i = 0; i < rows.length; i++) {
            const cellsOrig = Array.from(rows[i].querySelectorAll('th, td'))
                .map(c => c.textContent.trim());
            const cells = cellsOrig.map(c => c.toLowerCase());
            if (cells.includes('weightage') &&
                (cells.includes('obtained marks') || cells.includes('obtained'))) {
                headerRowIdx = i;
                hCells = cells;
                hCellsOrig = cellsOrig;
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

            const label = cells[0]?.textContent.trim() || 'Item';
            if (label.toLowerCase() === 'total') continue;

            const cellsArr = Array.from(cells);
            const weight   = getNumOrNull('weightage', cellsArr) || 0;
            const obtained = getNumOrNull('obtained marks', cellsArr) ?? getNumOrNull('obtained', cellsArr);
            const total    = getNumOrNull('total marks', cellsArr);
            const avg      = getNumOrNull('average', cellsArr);
            const minMarks = getText('minimum', cellsArr);
            const maxMarks = getText('maximum', cellsArr);

            currentCat.items.push({ label, weight, obtained, total, avg, min: minMarks, max: maxMarks });
        }

        // Clean up empty categories if any
        courseData.categories = courseData.categories.filter(c => c.items.length > 0);
    });

    // Remove courses with no valid categories
    marksData = marksData.filter(c => c.categories.length > 0);

    if (marksData.length === 0) return;

    if (window.ffDiffAndSave) {
        window.ffDiffAndSave(marksData, changedKeys => {
            if (window.renderMarksDashboard) window.renderMarksDashboard(marksData, changedKeys);
        });
    } else {
        if (window.renderMarksDashboard) window.renderMarksDashboard(marksData, new Set());
    }
    }

    window.runMarks = runMarks;
})();
