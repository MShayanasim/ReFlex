const fs = require('fs');
let js = fs.readFileSync('content.js', 'utf8');

// Fix 1: Add catWtObtained computation after isBelow
const oldCalc = `            const isBelow = hasAvg && catPct < catAvgPct;\n\n            const catDiff`;
const newCalc = `            const isBelow = hasAvg && catPct < catAvgPct;\n            const catWtObtained = catWeight > 0 && catTotal > 0 ? (catObtained / catTotal * catWeight) : 0;\n            const catAvgWtObtained = catWeight > 0 && catTotal > 0 ? (catAvgObtained / catTotal * catWeight) : 0;\n\n            const catDiff`;
if (!js.includes(oldCalc)) { console.log('FIX1: Not found'); } else { js = js.replace(oldCalc, newCalc); console.log('FIX1: OK'); }

// Fix 2a: Replace MY SCORE subtitle % with wt
const oldMyPct = `                        <span class="ff-score-sub">\${catPct.toFixed(1)}%</span>`;
const newMyWt  = `                        <span class="ff-score-sub">\${catWtObtained.toFixed(2)} / \${catWeight.toFixed(1)} wt</span>`;
if (!js.includes(oldMyPct)) { console.log('FIX2a: Not found'); } else { js = js.replace(oldMyPct, newMyWt); console.log('FIX2a: OK'); }

// Fix 2b: Replace CLASS AVG subtitle % with wt
const oldAvgPct = `                        <span class="ff-score-sub">\${catAvgPct.toFixed(1)}%</span>`;
const newAvgWt  = `                        <span class="ff-score-sub">\${catAvgWtObtained.toFixed(2)} / \${catWeight.toFixed(1)} wt</span>`;
if (!js.includes(oldAvgPct)) { console.log('FIX2b: Not found'); } else { js = js.replace(oldAvgPct, newAvgWt); console.log('FIX2b: OK'); }

// Fix 3: Move weightage pill to left of score value, removing it from the right end
const oldRow = `                    <span class="ff-item-val">\${item.obtained} / \${item.total}</span>
                    \${avgPct !== null ? \`<span class="ff-item-avg">avg \${item.avg.toFixed ? item.avg.toFixed(1) : item.avg}</span>\` : ''}
                    \${minMaxHtml}
                    <span class="ff-item-weightage" title="Contributes \${item.weight}% to final grade">\${item.weight}%</span>`;
const newRow = `                    <span class="ff-item-weightage" title="Contributes \${item.weight}% to final grade">\${item.weight}%</span>
                    <span class="ff-item-val">\${item.obtained} / \${item.total}</span>
                    \${avgPct !== null ? \`<span class="ff-item-avg">avg \${item.avg.toFixed ? item.avg.toFixed(1) : item.avg}</span>\` : ''}
                    \${minMaxHtml}`;
if (!js.includes(oldRow)) { console.log('FIX3: Not found'); } else { js = js.replace(oldRow, newRow); console.log('FIX3: OK'); }

fs.writeFileSync('content.js', js);
console.log('Done.');
