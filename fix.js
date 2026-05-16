const fs = require('fs');
let code = fs.readFileSync('content.js', 'utf8');
let idx = code.indexOf('window.ffRunTranscript =');
if (idx > -1) {
    code = code.substring(0, idx);
}
let boot = `window.ffRunTranscript = () => { if (typeof runTranscript === 'function') runTranscript(); };

// ==========================================================================
// 6. BOOT — All dependencies are now defined, start the engine
// ==========================================================================
if (typeof window.ffWatch === 'function') {
    window.ffWatch();
} else {
    document.addEventListener('DOMContentLoaded', () => {
        window.ffWatch && window.ffWatch();
    });
}
`;
fs.writeFileSync('content.js', code + boot);
