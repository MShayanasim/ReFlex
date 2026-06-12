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

        const sem = { name: semName, courses: [] };
        
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length < 5) continue;

            const getCell = (name) => {
                const idx = hCells.indexOf(name);
                if (idx === -1) {
                    // Fallbacks if exactly "course name" or "crdhrs" aren't found
                    if (name === 'course name') {
                        const fallIdx = hCells.findIndex(h => h.includes('course'));
                        return fallIdx !== -1 ? cells[fallIdx]?.textContent.trim() : '';
                    }
                    if (name === 'crdhrs') {
                        const fallIdx = hCells.findIndex(h => h.includes('cr'));
                        return fallIdx !== -1 ? cells[fallIdx]?.textContent.trim() : '';
                    }
                    return '';
                }
                return cells[idx]?.textContent.trim() || '';
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
