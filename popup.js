document.addEventListener('DOMContentLoaded', () => {
    const versionDisplay = document.getElementById('versionDisplay');
    if (versionDisplay) {
        const manifest = chrome.runtime.getManifest();
        versionDisplay.textContent = `v${manifest.version}`;
    }
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



    // Check if user is logged in
    chrome.storage.local.get(['userEmail'], (result) => {
        if (result.userEmail) {
            updateLoginUI(result.userEmail);
        }
    });

    // Login button logic
    const OAUTH_CLIENT_ID = '650320840540-bjo54gekj5o1m0s5cmekiq6c86op2f5e.apps.googleusercontent.com';

    loginBtn.addEventListener('click', () => {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Authenticating securely...';
        
        const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
        const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth' +
            `?client_id=${encodeURIComponent(OAUTH_CLIENT_ID)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=code` +
            `&access_type=offline` +
            `&prompt=consent` +
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
                    loginBtn.disabled = false;
                }, 3000);
                return;
            }

            try {
                // Parse the authorization code from the redirect URL query parameters
                const params = new URL(redirectUrl).searchParams;
                const code = params.get('code');
                if (!code) throw new Error("No authorization code returned");

                // Exchange the code for tokens via Cloudflare Worker
                const tokenResponse = await fetch('https://reflex-notifier.shayanasim-dev.workers.dev/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_id: OAUTH_CLIENT_ID,
                        redirect_uri: redirectUri,
                        code: code
                    })
                });

                if (!tokenResponse.ok) {
                    const errTxt = await tokenResponse.text();
                    throw new Error("Worker token exchange failed: " + errTxt);
                }

                const tokenData = await tokenResponse.json();
                const accessToken = tokenData.access_token;
                const refreshToken = tokenData.refresh_token;
                const expiresIn = tokenData.expires_in || 3599;

                if (!accessToken) throw new Error("No access token returned from worker");

                // Fetch the user's email using the access token
                const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { 'Authorization': 'Bearer ' + accessToken }
                });
                
                const userInfo = await userInfoResponse.json();
                const userEmail = userInfo.email;
                if (!userEmail) throw new Error("Email not found");
                
                // Store token + expiry + refresh token so the background script can stay logged in
                chrome.storage.local.set({
                    isLoggedIn: true,
                    userEmail: userEmail,
                    authToken: accessToken,
                    tokenExpiry: Date.now() + (expiresIn * 1000),
                    refreshToken: refreshToken
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
                setTimeout(() => {
                    loginBtn.textContent = 'Login with Google';
                    loginBtn.style.backgroundColor = 'var(--accent-color)';
                    loginBtn.disabled = false;
                }, 3000);
            }
        });
    });

    // Logout logic
    logoutBtn.addEventListener('click', () => {
        chrome.storage.local.get(['authToken', 'refreshToken'], (result) => {
            // Revoke access token
            if (result.authToken) {
                fetch(`https://accounts.google.com/o/oauth2/revoke?token=${result.authToken}`)
                    .catch((e) => console.warn("ReFlex: Access token revocation failed.", e));
            }
            // Revoke refresh token so it can't be reused
            if (result.refreshToken) {
                fetch(`https://accounts.google.com/o/oauth2/revoke?token=${result.refreshToken}`)
                    .catch((e) => console.warn("ReFlex: Refresh token revocation failed.", e));
            }
            chrome.storage.local.remove(['userEmail', 'isLoggedIn', 'authToken', 'tokenExpiry', 'refreshToken', 'pending_email_queue', 'email_queue_start_time'], () => {
                updateLoginUI(null);
            });
        });
    });



    // Replay Tutorial logic
    const replayBtn = document.getElementById('replayBtn');
    if (replayBtn) {
        replayBtn.addEventListener('click', () => {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'REPLAY_TUTORIAL' })
                        .then(() => {
                            window.close(); // Close the popup if successful
                        })
                        .catch(() => {
                            // The receiving end doesn't exist (e.g. not on the Flex portal)
                            replayBtn.style.color = 'var(--danger-color)';
                            setTimeout(() => replayBtn.style.color = 'var(--text-secondary)', 2000);
                        });
                }
            });
        });
        
        // Add hover effect
        replayBtn.addEventListener('mouseover', () => replayBtn.style.color = '#fff');
        replayBtn.addEventListener('mouseout', () => replayBtn.style.color = 'var(--text-secondary)');
    }
});
