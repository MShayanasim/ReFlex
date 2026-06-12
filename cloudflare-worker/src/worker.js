export default {
  async fetch(request, env, ctx) {
    const requestOrigin = request.headers.get("Origin");
    // Match our extension ID across all Chromium browser origin schemes
    // Chrome: chrome-extension://  Edge: extension://  Brave: chrome-extension://
    const extensionId = "hljpjnkdjelocgcgocknamkjafgbfkfg";
    const expectedClientId = "650320840540-bjo54gekj5o1m0s5cmekiq6c86op2f5e.apps.googleusercontent.com";
    const expectedRedirectUri = `https://${extensionId}.chromiumapp.org/`;
    const isAllowedExtension = requestOrigin && requestOrigin.endsWith("://" + extensionId) &&
        /^(chrome-extension|extension)$/.test(requestOrigin.split("://")[0]);
    const corsOrigin = isAllowedExtension ? requestOrigin : "chrome-extension://" + extensionId;

    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Handle CORS preflight request
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // We only accept POST requests
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      const data = await request.json();

      const ip = request.headers.get("cf-connecting-ip") || "unknown-ip";

      // OAuth Token Exchange Endpoint (Initial Login)
      if (url.pathname === '/api/auth') {
        const { code, redirect_uri, client_id } = data;
        if (!code || !redirect_uri || !client_id) {
          return new Response(JSON.stringify({ error: "Missing auth parameters" }), { status: 400, headers: corsHeaders });
        }
        if (client_id !== expectedClientId || redirect_uri !== expectedRedirectUri) {
          return new Response(JSON.stringify({ error: "Invalid OAuth client or redirect URI" }), { status: 403, headers: corsHeaders });
        }

        // Rate limit: Max 10 auth requests per IP per hour
        const authRateKey = `auth_${ip}`;
        const authCountStr = await env.RATE_LIMIT_STORE.get(authRateKey);
        const authCount = parseInt(authCountStr || "0", 10);
        if (authCount >= 10) {
          return new Response(JSON.stringify({ error: "Too many auth requests from this IP" }), { status: 429, headers: corsHeaders });
        }
        ctx.waitUntil(env.RATE_LIMIT_STORE.put(authRateKey, (authCount + 1).toString(), { expirationTtl: 3600 }));

        if (!env.GOOGLE_CLIENT_SECRET) {
           return new Response(JSON.stringify({ error: "Server missing Google Client Secret" }), { status: 500, headers: corsHeaders });
        }

        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: client_id,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            code: code,
            grant_type: "authorization_code",
            redirect_uri: redirect_uri
          })
        });

        const tokenData = await tokenResponse.json();
        return new Response(JSON.stringify(tokenData), {
          status: tokenResponse.ok ? 200 : tokenResponse.status,
          headers: corsHeaders
        });
      }

      // OAuth Token Refresh Endpoint (Silent Refresh)
      if (url.pathname === '/api/refresh') {
        const { refresh_token, client_id } = data;
        if (!refresh_token || !client_id) {
          return new Response(JSON.stringify({ error: "Missing refresh parameters" }), { status: 400, headers: corsHeaders });
        }
        if (client_id !== expectedClientId) {
          return new Response(JSON.stringify({ error: "Invalid OAuth client" }), { status: 403, headers: corsHeaders });
        }

        // Rate limit: Max 30 refresh requests per IP per hour
        const refreshRateKey = `refresh_${ip}`;
        const refreshCountStr = await env.RATE_LIMIT_STORE.get(refreshRateKey);
        const refreshCount = parseInt(refreshCountStr || "0", 10);
        if (refreshCount >= 30) {
          return new Response(JSON.stringify({ error: "Too many refresh requests from this IP" }), { status: 429, headers: corsHeaders });
        }
        ctx.waitUntil(env.RATE_LIMIT_STORE.put(refreshRateKey, (refreshCount + 1).toString(), { expirationTtl: 3600 }));

        if (!env.GOOGLE_CLIENT_SECRET) {
           return new Response(JSON.stringify({ error: "Server missing Google Client Secret" }), { status: 500, headers: corsHeaders });
        }

        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: client_id,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            refresh_token: refresh_token,
            grant_type: "refresh_token"
          })
        });

        const tokenData = await tokenResponse.json();
        return new Response(JSON.stringify(tokenData), {
          status: tokenResponse.ok ? 200 : tokenResponse.status,
          headers: corsHeaders
        });
      }

      // Email Sending Endpoint
      if (url.pathname === '/api/email') {
        // Verify Google OAuth Token to prevent abuse
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), { status: 401, headers: corsHeaders });
      }
      
      const token = authHeader.split(" ")[1];

      // The extension will send the user's email and the update text
      const userEmail = data.email; 
      const updateMessageRaw = data.message;
      
      if (!userEmail || !updateMessageRaw) {
        return new Response(JSON.stringify({ error: "Missing email or message data" }), { status: 400, headers: corsHeaders });
      }

      // Sanitize the message but preserve the intended <br> breaks
      const updateMessage = String(updateMessageRaw).split('<br>').map(str => {
        return str.replace(/[&<>"']/g, match => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[match]));
      }).join('<br>');

      // Verify the token with Google
      const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`);
      if (!tokenInfoRes.ok) {
        return new Response(JSON.stringify({ error: "Invalid Google token" }), { status: 401, headers: corsHeaders });
      }
      
      const tokenInfo = await tokenInfoRes.json();
      if (tokenInfo.email !== userEmail) {
        return new Response(JSON.stringify({ error: "Token email does not match requested email" }), { status: 403, headers: corsHeaders });
      }
      
      // CRITICAL SECURITY FIX: Ensure the token was generated for OUR Extension Client ID
      if (tokenInfo.aud !== expectedClientId) {
        return new Response(JSON.stringify({ error: "Unauthorized Client ID" }), { status: 403, headers: corsHeaders });
      }

      // CRITICAL SECURITY FIX 2: Rate Limiting
      // Protect your Brevo quota from malicious draining using Cloudflare KV.
      // Only authenticated, matching-token requests consume quota.
      const now = Date.now();
      const dateStr = new Date(now).toISOString().split('T')[0];
      const dailyKey = `daily_${dateStr}`;
      
      // Execute KV reads in parallel
      const [emailLimit, ipLimit, dailyCountStr] = await Promise.all([
        env.RATE_LIMIT_STORE.get(`email_${userEmail}`),
        env.RATE_LIMIT_STORE.get(`ip_${ip}`),
        env.RATE_LIMIT_STORE.get(dailyKey)
      ]);

      const dailyCount = parseInt(dailyCountStr || "0", 10);
      if (dailyCount >= 600) {
        return new Response(JSON.stringify({ error: "Global daily email limit reached to protect quotas. Try again tomorrow." }), { status: 429, headers: corsHeaders });
      }

      if (emailLimit) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded for this email. Please wait 60 seconds." }), { status: 429, headers: corsHeaders });
      }
      
      const ipCount = parseInt(ipLimit || "0", 10);
      if (ipCount >= 5) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded for this IP. Please wait 1 minute." }), { status: 429, headers: corsHeaders });
      }

      await Promise.all([
         env.RATE_LIMIT_STORE.put(dailyKey, (dailyCount + 1).toString(), { expirationTtl: 86400 }),
         env.RATE_LIMIT_STORE.put(`email_${userEmail}`, "1", { expirationTtl: 60 }),
         env.RATE_LIMIT_STORE.put(`ip_${ip}`, (ipCount + 1).toString(), { expirationTtl: 60 })
      ]);

      // Retrieve all available keys configured in Cloudflare secrets
      // Map each key to its specific verified sender email to prevent account linking
      const apiAccounts = [
        { name: "BREVO_API_KEY_1", key: env.BREVO_API_KEY,   email: "shayanasim.dev@gmail.com" },
        { name: "BREVO_API_KEY_2", key: env.BREVO_API_KEY_2, email: "shaneasim979@gmail.com" },
        { name: "BREVO_API_KEY_3", key: env.BREVO_API_KEY_3, email: "shaneasim171@gmail.com" }, // Update with your 3rd verified email
        { name: "BREVO_API_KEY_4", key: env.BREVO_API_KEY_4, email: "shayanasim.dev@gmail.com" }
      ].filter(account => Boolean(account.key)); // Filters out any undefined keys

      if (apiAccounts.length === 0) {
        return new Response(JSON.stringify({ error: "Server missing Brevo API keys" }), { status: 500, headers: corsHeaders });
      }

      let emailResult;
      let res;
      let usedKeyName = "";

      // Attempt to send the email, falling back to the next key if quota/rate limits hit
      for (let i = 0; i < apiAccounts.length; i++) {
        res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": apiAccounts[i].key,
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            sender: {
              name: "ReFlex Notifications",
              email: apiAccounts[i].email
            },
            to: [{ email: userEmail }],
            subject: "ReFlex: Grade/Portal Update Detected!",
            htmlContent: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <div style="background-color: #4f46e5; padding: 24px; text-align: center;">
                  <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 0.5px;">ReFlex Alert</h2>
                </div>
                <div style="padding: 32px 24px;">
                  <p style="color: #374151; font-size: 16px; margin-top: 0;">Hi there,</p>
                  <p style="color: #4b5563; font-size: 15px; line-height: 1.5;">ReFlex has detected a new update on your FAST-NUCES portal:</p>
                  
                  <div style="background-color: #f3f4f6; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
                    <p style="color: #111827; font-size: 15px; font-weight: 600; margin: 0; line-height: 1.4;">${updateMessage}</p>
                  </div>
                  
                  <div style="text-align: center; margin-top: 32px;">
                    <a href="https://flexstudent.nu.edu.pk/" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 15px;">
                      Open Flex Portal
                    </a>
                  </div>
                </div>
                <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">Sent securely via the ReFlex Extension.</p>
                </div>
              </div>
            `
          })
        });

        const textResponse = await res.text();
        try {
          emailResult = JSON.parse(textResponse);
        } catch (e) {
          emailResult = textResponse; // Fallback to raw text if Brevo returns non-JSON
        }

        // If the request was successful, break the loop
        if (res.ok) {
          usedKeyName = apiAccounts[i].name;
          break;
        }

        // If it's a 400 Bad Request, there's a problem with the payload (e.g., bad email address).
        // Retrying won't fix it, so we break immediately.
        if (res.status === 400) {
          break;
        }
        
        // Otherwise (e.g. 402 Payment Required, 403 Forbidden, 429 Too Many Requests), 
        // we'll loop again and try the next API key!
      }
      
      if (!res.ok) {
        return new Response(JSON.stringify({ error: "Email delivery failed on all available keys", details: emailResult }), {
          status: res.status,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      return new Response(JSON.stringify({ success: true, key_used: usedKeyName, brevo: emailResult }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });

      }
      
      return new Response(JSON.stringify({ error: "Endpoint not found" }), { status: 404, headers: corsHeaders });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      });
    }
  }
};
