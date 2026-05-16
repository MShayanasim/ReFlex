const fs = require('fs');

// 1. UPDATE CONTENT.JS
let js = fs.readFileSync('content.js', 'utf8');

const targetJS = `
            const weightHtml   = weightPct   ? '<span class="ff-tr-weight">Weight: ' + weightPct + ' of SGPA</span>'           : '';
            const contribHtml  = contribPts   ? '<span class="ff-tr-contrib">Contributes ' + contribPts + ' pts to SGPA</span>' : '';

            const item = document.createElement('div');
            item.className = 'ff-transcript-row';
            item.innerHTML = \`
                <div class="ff-tr-left">
                    <div class="ff-tr-name">\${c.name}</div>
                    <div class="ff-tr-meta">
                        <span class="ff-tr-code">\${c.code} &bull; \${cr} CrHrs</span>
                        \${weightHtml}
                        \${contribHtml}
                    </div>
                </div>
                <div class="ff-grade-badge" style="background:\${gs.bg};border-color:\${gs.border};color:\${gs.text}">
                    \${c.grade || '—'}
                </div>
            \`;`;

const newJS = `
            const weightHtml   = weightPct   ? '<span class="ff-tr-weight">Weight: ' + weightPct + ' of SGPA</span>'           : '';
            const contribHtml  = contribPts   ? '<span class="ff-tr-contrib">Contributes ' + contribPts + ' pts to SGPA</span>' : '';

            const item = document.createElement('div');
            item.className = 'ff-transcript-row';
            item.innerHTML = \`
                <div class="ff-tr-left">
                    <div class="ff-tr-name">\${c.name}</div>
                    <div class="ff-tr-meta">
                        <span class="ff-tr-code">\${c.code} &bull; \${cr} CrHrs</span>
                        \${weightHtml ? '<span class="ff-tr-sep">&nbsp;|&nbsp;</span>' + weightHtml : ''}
                        \${contribHtml ? '<span class="ff-tr-sep">&nbsp;|&nbsp;</span>' + contribHtml : ''}
                    </div>
                </div>
                <div class="ff-grade-badge" style="background:\${gs.bg};border-color:\${gs.border};color:\${gs.text}">
                    \${c.grade || '—'}
                </div>
            \`;`;

if (js.includes(targetJS)) {
    js = js.replace(targetJS, newJS);
    fs.writeFileSync('content.js', js);
    console.log('content.js updated!');
} else {
    console.log('Target in content.js not found.');
}

// 2. UPDATE STYLES.CSS
let css = fs.readFileSync('styles.css', 'utf8');

const targetCSS = `.ff-transcript-row {
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
}`;

const newCSS = `.ff-transcript-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px 0;
    border-bottom: 1px solid #f1f5f9;
}
.ff-transcript-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
}
.ff-tr-name {
    font-size: 1.05rem;
    font-weight: 600;
    color: #334155;
    margin-bottom: 8px;
}
.ff-tr-meta {
    display: flex;
    font-size: 0.8rem;
    align-items: center;
}
.ff-tr-sep {
    color: #cbd5e1;
    margin: 0 8px;
}`;

if (css.includes(targetCSS)) {
    css = css.replace(targetCSS, newCSS);
    fs.writeFileSync('styles.css', css);
    console.log('styles.css updated!');
} else {
    console.log('Target in styles.css not found.');
}

// UPDATE DARK MODE STYLES
const darkTarget = `html.ff-dark .ff-transcript-row { border-color: rgba(255,255,255,0.08); }
html.ff-dark .ff-tr-name { color: #f1f5f9; }
html.ff-dark .ff-tr-code { color: #64748b; }
html.ff-dark .ff-tr-weight { color: #60a5fa; }
html.ff-dark .ff-tr-contrib { color: #4ade80; }`;

const darkNew = `html.ff-dark .ff-transcript-row { border-color: rgba(255,255,255,0.08); }
html.ff-dark .ff-tr-name { color: #f1f5f9; }
html.ff-dark .ff-tr-code { color: #64748b; }
html.ff-dark .ff-tr-sep { color: #475569; }
html.ff-dark .ff-tr-weight { color: #60a5fa; }
html.ff-dark .ff-tr-contrib { color: #4ade80; }`;

if (css.includes(darkTarget)) {
    css = css.replace(darkTarget, darkNew);
    fs.writeFileSync('styles.css', css);
    console.log('styles.css dark mode updated!');
} else {
    console.log('Dark target in styles.css not found.');
}
