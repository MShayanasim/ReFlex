const fs = require('fs');

// ── 1. PATCH content.js ──────────────────────────────────────────────────────
let js = fs.readFileSync('content.js', 'utf8');

// Replace the messy block from 'let weightPct' to 'courseList.appendChild(item);'
const oldBlock = /let weightPct = '';[\s\S]*?courseList\.appendChild\(item\);/;

const newBlock = `let weightPct = '';
            let contribPts = '';
            if (cr > 0 && sem.semCrHrs > 0) {
                weightPct = ((cr / sem.semCrHrs) * 100).toFixed(1) + '% of SGPA';
                if (pts > 0) {
                    contribPts = ((pts * cr) / sem.semCrHrs).toFixed(3) + ' pts to SGPA';
                }
            }

            const item = document.createElement('div');
            item.className = 'ff-transcript-row';
            item.innerHTML =
                '<div class="ff-tr-left">' +
                    '<div class="ff-tr-name">' + c.name + '</div>' +
                    '<div class="ff-tr-meta">' +
                        '<span class="ff-tr-code">' + c.code + ' \u2022 ' + cr + ' Cr</span>' +
                        (weightPct ? '<span class="ff-tr-sep">|</span><span class="ff-tr-weight">Weight: ' + weightPct + '</span>' : '') +
                        (contribPts ? '<span class="ff-tr-sep">|</span><span class="ff-tr-contrib">Contributes ' + contribPts + '</span>' : '') +
                    '</div>' +
                '</div>' +
                '<div class="ff-grade-badge" style="background:' + gs.bg + ';border-color:' + gs.border + ';color:' + gs.text + '">' +
                    (c.grade || '\u2014') +
                '</div>';
            courseList.appendChild(item);`;

if (oldBlock.test(js)) {
    js = js.replace(oldBlock, newBlock);
    fs.writeFileSync('content.js', js);
    console.log('[OK] content.js patched');
} else {
    console.log('[MISS] content.js pattern not found');
}

// ── 2. PATCH styles.css ──────────────────────────────────────────────────────
let css = fs.readFileSync('styles.css', 'utf8');

// 2a. Increase card padding
css = css.replace(
    '.ff-transcript-card {\n    padding: 32px 36px;\n}',
    '.ff-transcript-card {\n    padding: 36px 42px;\n}'
);

// 2b. Increase row padding & soften border
css = css.replace(
    '    padding: 20px 0;\n    border-bottom: 1px dashed #e2e8f0;',
    '    padding: 26px 0;\n    border-bottom: 1px solid #f1f5f9;'
);

// 2c. Update name font size
css = css.replace(
    '    font-size: 0.95rem;\n    font-weight: 600;\n    color: #334155;\n    margin-bottom: 6px;',
    '    font-size: 1rem;\n    font-weight: 600;\n    color: #334155;\n    margin-bottom: 8px;'
);

// 2d. Update meta font size & gap
css = css.replace(
    '    font-size: 0.75rem;\n    align-items: center;\n}\n.ff-tr-code',
    '    font-size: 0.8rem;\n    align-items: center;\n    gap: 6px;\n}\n.ff-tr-sep {\n    color: #cbd5e1;\n    margin: 0 2px;\n    font-weight: 400;\n}\n.ff-tr-code'
);

// 2e. Add dark mode sep if missing
if (!css.includes('ff-tr-sep')) {
    css = css.replace(
        'html.ff-dark .ff-tr-contrib',
        'html.ff-dark .ff-tr-sep { color: #475569; }\nhtml.ff-dark .ff-tr-contrib'
    );
}

fs.writeFileSync('styles.css', css);
console.log('[OK] styles.css patched');
