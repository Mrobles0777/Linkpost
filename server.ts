import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // In-memory store for tokens (for demo purposes, in a real app use a database or secure session)
  let linkedinToken: string | null = null;
  let linkedinUserUrn: string | null = null;

  // API: Get Auth URL
  app.get("/api/auth/linkedin/url", (req, res) => {
    const isLogin = req.query.login === 'true';
    const redirectUri = `${process.env.APP_URL}/auth/linkedin/callback`;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.LINKEDIN_CLIENT_ID || "",
      redirect_uri: redirectUri,
      state: isLogin ? "login" : "connect",
      scope: "w_member_social profile openid email",
    });
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
    res.json({ url: authUrl });
  });

  // Callback: Handle LinkedIn redirect
  app.get("/auth/linkedin/callback", async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.status(400).send("No code provided");

    const redirectUri = `${process.env.APP_URL}/auth/linkedin/callback`;
    
    try {
      // Exchange code for token
      const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: redirectUri,
          client_id: process.env.LINKEDIN_CLIENT_ID || "",
          client_secret: process.env.LINKEDIN_CLIENT_SECRET || "",
        }),
      });

      const tokenData = await tokenResponse.json();
      if (tokenData.error) throw new Error(tokenData.error_description);

      linkedinToken = tokenData.access_token;

      // Get User info
      const userResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${linkedinToken}` },
      });
      const userData = await userResponse.json();
      linkedinUserUrn = `urn:li:person:${userData.sub}`;

      // If it was a login, we could potentially create a session here
      // For now, we'll just notify the frontend

      res.send(`
        <html>
          <head>
            <title>Autenticando...</title>
            <style>
              body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f3f2ef; }
              .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; }
              .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #0a66c2; border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="spinner"></div>
              <p>Conectando con LinkedIn...</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ 
                    type: 'LINKEDIN_AUTH_SUCCESS', 
                    isLogin: ${state === 'login'},
                    user: ${JSON.stringify(userData)}
                  }, '*');
                  setTimeout(() => window.close(), 500);
                } else {
                  window.location.href = '/';
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("LinkedIn Auth Error:", error);
      res.status(500).send(`
        <div style="padding: 20px; font-family: sans-serif; text-align: center;">
          <h2 style="color: #d32f2f;">Error de Autenticación</h2>
          <p>${error.message}</p>
          <button onclick="window.close()" style="padding: 10px 20px; background: #0a66c2; color: white; border: none; border-radius: 4px; cursor: pointer;">Cerrar</button>
        </div>
      `);
    }
  });

  // API: Check if connected
  app.get("/api/auth/linkedin/status", (req, res) => {
    res.json({ connected: !!linkedinToken });
  });

  // API: Post to LinkedIn
  app.post("/api/linkedin/post", async (req, res) => {
    if (!linkedinToken || !linkedinUserUrn) {
      return res.status(401).json({ error: "Not connected to LinkedIn" });
    }

    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });

    try {
      const postResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${linkedinToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: linkedinUserUrn,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: { text },
              shareMediaCategory: "NONE",
            },
          },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
        }),
      });

      const postData = await postResponse.json();
      if (postResponse.ok) {
        res.json({ success: true, data: postData });
      } else {
        res.status(postResponse.status).json({ error: postData });
      }
    } catch (error: any) {
      console.error("LinkedIn Post Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
