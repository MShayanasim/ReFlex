function runTranscript() {
    const tables = document.querySelectorAll('table');
    let semesters = [];

    tables.forEach(table => {
        const rows = Array.from(table.querySelectorAll('tr'));
        
        // Find header row
        let headerRowIdx = -1;
        let hCells = [];
        for (let i = 0; i < rows.length; i++) {
            const cells = Array.from(rows[i].querySelectorAll('th, td')).map(c => c.innerText.trim().toLowerCase());
            if (cells.includes('code') && (cells.includes('course name') || cells.includes('course'))) {
                headerRowIdx = i;
                hCells = cells;
                break;
            }
        }

        if (headerRowIdx === -1) return;

        // Find semester name
        let semName = "Semester";
        let container = table.closest('.m-portlet');
        if (container) {
            let titleEl = container.querySelector('.m-portlet__head-text, h3, h4');
            if (titleEl) {
                semName = titleEl.innerText.trim();
                // Extract just the semester part (e.g. "Fall 2025") from "Fall 2025 Cr. Att:18..."
                semName = semName.split(/Cr\.?\s*Att/i)[0].trim();
            }
        }

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
                        return fallIdx !== -1 ? cells[fallIdx]?.innerText.trim() : '';
                    }
                    if (name === 'crdhrs') {
                        const fallIdx = hCells.findIndex(h => h.includes('cr'));
                        return fallIdx !== -1 ? cells[fallIdx]?.innerText.trim() : '';
                    }
                    return '';
                }
                return cells[idx]?.innerText.trim() || '';
            };

            const code = getCell('code');
            const name = getCell('course name');
            const grade = getCell('grade');
            const points = getCell('points');
            const crhrs = getCell('crdhrs');

            if (code && name) {
                sem.courses.push({ code, name, grade, points, crhrs });
            }
        }
        
        if (sem.courses.length > 0) {
            semesters.push(sem);
        }
    });

    if (semesters.length === 0) return;
    renderTranscriptDashboard(semesters);
}
