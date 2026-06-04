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
    const OAUTH_CLIENT_ID = '650320840540-bjo54gekj5o1m0s5cmekiq6c86op2f5e.apps.googleusercontent.com';

    loginBtn.addEventListener('click', () => {
        loginBtn.textContent = 'Authenticating securely...';
        
        const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
        const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth' +
            `?client_id=${encodeURIComponent(OAUTH_CLIENT_ID)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=token` +
            `&scope=${encodeURIComponent('https://www.googleapis.com/auth/userinfo.email')}`;
        
        chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (redirectUrl) => {
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

            try {
                // Parse the access token from the redirect URL fragment
                const params = new URLSearchParams(new URL(redirectUrl).hash.substring(1));
                const accessToken = params.get('access_token');
                const expiresIn = parseInt(params.get('expires_in'), 10);
                if (!accessToken) throw new Error("No access token returned");

                // Fetch the user's email using the access token
                const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { 'Authorization': 'Bearer ' + accessToken }
                });
                
                const userInfo = await userInfoResponse.json();
                const userEmail = userInfo.email;
                if (!userEmail) throw new Error("Email not found");
                
                // Store token + expiry so the background script can send emails
                chrome.storage.local.set({
                    isLoggedIn: true,
                    userEmail: userEmail,
                    authToken: accessToken,
                    tokenExpiry: Date.now() + (expiresIn * 1000)
                }, () => {
                    loginBtn.textContent = `✓ Logged in as: ${userEmail}`;
                    loginBtn.style.backgroundColor = 'var(--success-color)';
                    loginBtn.disabled = true;
                    updateLoginUI(userEmail);
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
        chrome.storage.local.get(['authToken'], (result) => {
            if (result.authToken) {
                fetch(`https://accounts.google.com/o/oauth2/revoke?token=${result.authToken}`)
                    .catch((e) => console.warn("ReFlex: Token revocation failed.", e));
            }
            chrome.storage.local.remove(['userEmail', 'isLoggedIn', 'authToken', 'tokenExpiry', 'pending_email_queue', 'email_queue_start_time'], () => {
                updateLoginUI(null);
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
