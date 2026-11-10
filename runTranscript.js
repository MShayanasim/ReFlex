(function() {
    'use strict';
    function runTranscript() {
    const tables = document.querySelectorAll('table');
    let semesters = [];

    tables.forEach(table => {
        const rows = Array.from(table.querySelectorAll('tr'));
        
        // Find header row
        let headerRowIdx = -1;
        let hCells = [];
        for (let i = 0; i < rows.length; i++) {
            const cells = Array.from(rows[i].querySelectorAll('th, td')).map(c => c.textContent.trim().toLowerCase());
            if (cells.includes('code') && (cells.includes('course name') || cells.includes('course'))) {
                headerRowIdx = i;
                hCells = cells;
                break;
            }
        }

        if (headerRowIdx === -1) return;

                // Find semester name — try multiple strategies
        let semName = '';
        const semPattern = /\b(Fall|Spring|Summer)\s+\d{4}\b/i;

        // Strategy 1: look at rows before header in the same table
        for (let i = 0; i < headerRowIdx; i++) {
            const text = rows[i].innerText || rows[i].textContent || '';
            const m = text.match(semPattern);
            if (m) { semName = m[0]; break; }
            else {
                const cleaned = text.split(/Cr\.?\s*Att/i)[0].trim().split('\n')[0].trim();
                if (cleaned && cleaned.length > 3 && cleaned.length < 30) {
                    semName = cleaned;
                }
            }
        }

        // Strategy 2: Look at previous sibling elements in the DOM
        if (!semName) {
            let curr = table;
            for (let up = 0; up < 3 && curr && curr !== document.body && !semName; up++) {
                let sibling = curr.previousElementSibling;
                while (sibling && !semName) {
                    const text = sibling.innerText || sibling.textContent || '';
                    const m = text.match(semPattern);
                    if (m) { semName = m[0]; break; }
                    if (sibling.tagName === 'TABLE' || sibling.querySelector('table')) break;
                    sibling = sibling.previousElementSibling;
                }
                curr = curr.parentElement;
            }
        }

        if (!semName) semName = 'Semester ' + (semesters.length + 1);

        // Extract portal summary stats (Cr. Att, Cr. Ernd) if present in DOM
        let portalCrAtt = null;
        let portalCrErnd = null;
        let statsText = '';
        for (let i = 0; i < headerRowIdx; i++) {
            statsText += ' ' + (rows[i].innerText || rows[i].textContent || '');
        }
        if (table.previousElementSibling) {
            statsText += ' ' + (table.previousElementSibling.innerText || table.previousElementSibling.textContent || '');
        }
        const colParent = table.closest('.col-md-6, .col-lg-6, [class*="col-"]') || table.parentElement;
        if (colParent) {
            const pullRight = colParent.querySelector('.pull-right, [class*="pull-"]');
            if (pullRight) {
                statsText += ' ' + (pullRight.innerText || pullRight.textContent || '');
            }
        }
        const attM = statsText.match(/Cr\.?\s*Att\s*:\s*([\d.]+)/i);
        const erndM = statsText.match(/Cr\.?\s*Ernd\s*:\s*([\d.]+)/i);
        if (attM) portalCrAtt = parseFloat(attM[1]);
        if (erndM) portalCrErnd = parseFloat(erndM[1]);

        const sem = { name: semName, courses: [], portalCrAtt, portalCrErnd };
        
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length < 5) continue;

            const getCell = (name) => {
                let idx = hCells.indexOf(name);
                if (idx === -1) {
                    // Fallbacks if exactly "course name", "crdhrs", "type", or "remarks" aren't found
                    if (name === 'course name') {
                        idx = hCells.findIndex(h => h.includes('course'));
                    } else if (name === 'crdhrs') {
                        idx = hCells.findIndex(h => h.includes('cr'));
                    } else if (name === 'type') {
                        idx = hCells.findIndex(h => h.includes('type'));
                    } else if (name === 'remarks') {
                        idx = hCells.findIndex(h => h.includes('remark'));
                    }
                }
                if (idx === -1) return '';
                return cells[idx]?.textContent.replace(/\s+/g, ' ').trim() || '';
            };

            const code = getCell('code');
            const name = getCell('course name');
            const grade = getCell('grade');
            const points = getCell('points');
            const crhrs = getCell('crdhrs');
            const remarks = getCell('remarks');
            const type = getCell('type');

            if (code && name) {
                sem.courses.push({ code, name, grade, points, crhrs, remarks, type });
            }
        }
        
        if (sem.courses.length > 0) {
            semesters.push(sem);
        }
    });

    if (window.renderTranscriptDashboard) window.renderTranscriptDashboard(semesters);
    }
    
    window.runTranscript = runTranscript;
})();
