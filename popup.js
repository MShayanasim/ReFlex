document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('masterToggle');

    // Load initial state
    chrome.storage.sync.get(['flexUiEnabled'], (result) => {
        // Default to true if not set
        toggle.checked = result.flexUiEnabled !== false; 
    });

    // Save state on change
    toggle.addEventListener('change', () => {
        const isEnabled = toggle.checked;
        chrome.storage.sync.set({ flexUiEnabled: isEnabled }, () => {
            // Optional: Auto-reload the active tab if it's the portal
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0] && tabs[0].url && tabs[0].url.includes("nu.edu.pk")) {
                    chrome.tabs.reload(tabs[0].id);
                }
            });
        });
    });
});
