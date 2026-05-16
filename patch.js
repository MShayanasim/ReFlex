const fs = require('fs');

// 1. UPDATE CONTENT.JS
let js = fs.readFileSync('content.js', 'utf8');

const startMarker = 'function renderTranscriptDashboard(semesters) {';
const endMarker = 'window.ffRunTranscript = () => {';

const startIndex = js.indexOf(startMarker);
const endIndex = js.indexOf(endMarker);

const replacement = `function renderTranscriptDashboard(semesters) {
    if (!ffUIEnabled) return;
    hideNative();

    const root = mountRoot();

    const header = document.createElement('div');
    header.className = 'ff-header';
    header.innerHTML = \`<h2>Transcript Dashboard</h2>\`;
    root.appendChild(header);

    // Pre-calculate running points and SGPA/CGPA for all semesters
    let runningPoints = 0, runningCrHrs = 0;
    semesters.forEach(sem => {
        let semPoints = 0, semCrHrs = 0;
        sem.courses.forEach(c => {
            const cr = parseFloat(c.crhrs) || 0;
            const pts = parseFloat(c.points) || 0;
            if (cr > 0 && c.grade && c.grade !== '-' && c.grade !== 'NC') {
                semPoints += pts * cr;
                semCrHrs  += cr;
                runningPoints += pts * cr;
                runningCrHrs  += cr;
                // Cache credit hours for attendance module
                const codeMatch = c.code.match(/^([A-Z]{2,4}\\d{4})/i);
                if (codeMatch) _crCache[codeMatch[1].toUpperCase()] = cr;
            }
        });
        sem.sgpa = semCrHrs > 0 ? (semPoints / semCrHrs).toFixed(2) : '—';
        sem.cgpa = runningCrHrs > 0 ? (runningPoints / runningCrHrs).toFixed(2) : '—';
        sem.semCrHrs = semCrHrs;
    });

    // Create Semester Tabs
    const tabsRow = document.createElement('div');
    tabsRow.className = 'ff-course-tabs';
    tabsRow.style.marginBottom = '24px';
    
    // Create the main card that will hold the courses
    const mainCard = document.createElement('div');
    mainCard.className = 'ff-semester-card ff-transcript-card';
    
    // Function to render a specific semester
    function renderSemester(index) {
        // Update tabs
        Array.from(tabsRow.children).forEach((tab, i) => {
            tab.classList.toggle('active', i === index);
        });
        
        const sem = semesters[index];
        mainCard.innerHTML = \`
            <div class="ff-sem-header" style="align-items: center; margin-bottom: 30px;">
                <span class="ff-sem-title" style="font-size: 1.4rem;">\${sem.name}</span>
                <div class="ff-sem-rings">
                    <div class="ff-ring" title="Semester GPA">
                        <span>\${sem.sgpa}</span><small>SGPA</small>
                    </div>
                    <div class="ff-ring" title="Cumulative GPA so far">
                        <span>\${sem.cgpa}</span><small>CGPA</small>
                    </div>
                </div>
            </div>
            <div class="ff-course-list ff-clean-list"></div>
        \`;
        
        const courseList = mainCard.querySelector('.ff-course-list');
        
        sem.courses.forEach(c => {
            const gs = gradeStyle(c.grade);
            const cr = parseFloat(c.crhrs) || 0;
            const pts = parseFloat(c.points) || 0;
            
            let weightPct = '';
            let contribPts = '';
            if (cr > 0 && sem.semCrHrs > 0) {
                weightPct = ((cr / sem.semCrHrs) * 100).toFixed(2) + '%';
                if (pts > 0) {
                    contribPts = ((pts * cr) / sem.semCrHrs).toFixed(3);
                }
            }

            const item = document.createElement('div');
            item.className = 'ff-transcript-row';
            item.innerHTML = \`
                <div class="ff-tr-left">
                    <div class="ff-tr-name">\${c.name}</div>
                    <div class="ff-tr-meta">
                        <span class="ff-tr-code">\${c.code} &bull; \${cr} CrHrs</span>
                        \${weightPct ? \\\`<span class="ff-tr-weight">Weight: \${weightPct} of SGPA</span>\\\` : ''}
                        \${contribPts ? \\\`<span class="ff-tr-contrib">Contributes \${contribPts} pts to SGPA</span>\\\` : ''}
                    </div>
                </div>
                <div class="ff-grade-badge" style="background:\${gs.bg};border-color:\${gs.border};color:\${gs.text}">
                    \${c.grade || '—'}
                </div>
            \`;
            courseList.appendChild(item);
        });
    }

    // Build tabs
    semesters.forEach((sem, i) => {
        const tab = document.createElement('div');
        tab.className = 'ff-tab';
        tab.style.flexDirection = 'row';
        tab.style.minWidth = 'auto';
        tab.innerHTML = \`<span class="ff-tab-code">\${sem.name}</span>\`;
        tab.onclick = () => renderSemester(i);
        tabsRow.appendChild(tab);
    });

    root.appendChild(tabsRow);
    root.appendChild(mainCard);
    
    // Select the last semester by default (most recent)
    if (semesters.length > 0) {
        renderSemester(semesters.length - 1);
    }
}
`;

js = js.substring(0, startIndex) + replacement + js.substring(endIndex);
fs.writeFileSync('content.js', js);

// 2. UPDATE STYLES.CSS
let css = fs.readFileSync('styles.css', 'utf8');

// Add new styles for transcript rows
const newCSS = `
/* ── Transcript Page Styles ────────────────────────────────── */
.ff-transcript-card {
    padding: 32px 36px;
}
.ff-transcript-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 0;
    border-bottom: 1px dashed #e2e8f0;
}
.ff-transcript-row:last-child {
    border-bottom: none;
}
.ff-tr-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: #334155;
    margin-bottom: 6px;
}
.ff-tr-meta {
    display: flex;
    gap: 16px;
    font-size: 0.75rem;
    align-items: center;
}
.ff-tr-code {
    color: #94a3b8;
    font-weight: 500;
}
.ff-tr-weight {
    color: #3b82f6;
    font-weight: 500;
}
.ff-tr-contrib {
    color: #22c55e;
    font-weight: 500;
}

html.ff-dark .ff-transcript-row { border-color: rgba(255,255,255,0.08); }
html.ff-dark .ff-tr-name { color: #f1f5f9; }
html.ff-dark .ff-tr-code { color: #64748b; }
html.ff-dark .ff-tr-weight { color: #60a5fa; }
html.ff-dark .ff-tr-contrib { color: #4ade80; }
`;

if (!css.includes('.ff-transcript-row')) {
    css += newCSS;
    fs.writeFileSync('styles.css', css);
}

console.log('Transcript styling applied');
