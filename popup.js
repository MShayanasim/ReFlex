document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('masterToggle');
    const loginSection = document.getElementById('loginSection');
    const loggedInSection = document.getElementById('loggedInSection');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userEmailDisplay = document.getElementById('userEmailDisplay');

    function updateLoginUI(email) {
        if (email) {
            loginSection.style.display = 'none';
            loggedInSection.style.display = 'flex';
            userEmailDisplay.textContent = email;
        } else {
            loginSection.style.display = 'flex';
            loggedInSection.style.display = 'none';
            userEmailDisplay.textContent = '';
        }
    }

    // Load initial state for toggle
    chrome.storage.sync.get(['flexUiEnabled'], (result) => {
        if (chrome.runtime.lastError) {
            console.warn('ReFlex: Could not load settings.', chrome.runtime.lastError.message);
            return;
        }
        // Default to true if not set
        toggle.checked = result.flexUiEnabled !== false; 
    });

    // Check if user is logged in
    chrome.storage.local.get(['userEmail'], (result) => {
        if (result.userEmail) {
            updateLoginUI(result.userEmail);
        }
    });

    // Login button logic
    loginBtn.addEventListener('click', () => {
        const clientId = '650320840540-bjo54gekj5o1m0s5cmekiq6c86op2f5e.apps.googleusercontent.com';
        const redirectUri = chrome.identity.getRedirectURL(); // The trailing slash is mandatory!
        // Changed response_type to 'code' for secure Authorization Code Flow
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=email`;


        chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true
        }, async (redirectUrl) => {
            if (chrome.runtime.lastError || !redirectUrl) {
                const errMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Unknown error';
                console.error('Auth Error:', errMsg);
                
                loginBtn.textContent = 'Error (See Console)';
                loginBtn.style.backgroundColor = 'var(--danger-color)';
                setTimeout(() => {
                    loginBtn.textContent = 'Login with Google';
                    loginBtn.style.backgroundColor = 'var(--accent-color)';
                }, 3000);
                return;
            }

            // Extract authorization code from redirect URL query parameters
            const url = new URL(redirectUrl);
            const code = url.searchParams.get('code');

            if (!code) {
                console.error("Authorization code not found in redirect URL:", redirectUrl);
                loginBtn.textContent = 'Login Failed';
                return;
            }
            
            try {
                loginBtn.textContent = 'Authenticating securely...';
                
                // Securely exchange code for access token via our Cloudflare Worker Proxy
                const WORKER_URL = 'https://reflex-notifier.shayanasim-dev.workers.dev/api/auth';
                const tokenResponse = await fetch(WORKER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code: code,
                        redirect_uri: redirectUri,
                        client_id: clientId
                    })
                });

                const tokenData = await tokenResponse.json();
                
                if (!tokenResponse.ok || !tokenData.access_token) {
                    throw new Error(tokenData.error || "Failed to exchange token");
                }

                const accessToken = tokenData.access_token;

                // Fetch the user email manually using the new secure access token
                const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { 'Authorization': 'Bearer ' + accessToken }
                });
                
                const userInfo = await userInfoResponse.json();
                const userEmail = userInfo.email;
                if (!userEmail) throw new Error("Email not found");
                
                chrome.storage.local.set({ isLoggedIn: true, userEmail: userEmail, accessToken: accessToken }, () => {
                    loginBtn.textContent = `✓ Logged in as: ${userEmail}`;
                    loginBtn.style.backgroundColor = 'var(--success-color)';
                    loginBtn.disabled = true;
                });

            } catch (err) {
                console.error("Secure OAuth Error:", err);
                loginBtn.textContent = 'Error Authenticating';
                loginBtn.style.backgroundColor = 'var(--danger-color)';
            }
        });
    });

    // Logout logic
    logoutBtn.addEventListener('click', () => {
        chrome.storage.local.remove(['userEmail', 'accessToken', 'isLoggedIn'], () => {
            // Attempt to remove cached token so user can switch accounts if needed
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                if (token) {
                    fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`).catch(() => {});
                    chrome.identity.removeCachedAuthToken({ token }, () => {
                        updateLoginUI(null);
                    });
                } else {
                    updateLoginUI(null);
                }
            });
        });
    });

    // Save state on change for UI overhaul
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
