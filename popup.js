document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('masterToggle');

    // Load initial state
    chrome.storage.sync.get(['flexUiEnabled'], (result) => {
        if (chrome.runtime.lastError) {
            console.warn('ReFlex: Could not load settings.', chrome.runtime.lastError.message);
            return;
        }
        // Default to true if not set
        toggle.checked = result.flexUiEnabled !== false; 
    });

    // Save state on change
    toggle.addEventListener('change', () => {
        const isEnabled = toggle.checked;
        chrome.storage.sync.set({ flexUiEnabled: isEnabled }, () => {
            if (chrome.runtime.lastError) {
                console.warn('ReFlex: Could not save setting.', chrome.runtime.lastError.message);
                return;
            }
            // Reload the active tab so the change takes effect
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0]) {
                    try { chrome.tabs.reload(tabs[0].id); }
                    catch (e) { /* tab may have navigated away */ }
                }
            });
        });
    });
});
