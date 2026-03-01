import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || "",
  process.env.VITE_SUPABASE_ANON_KEY || ""
);

// API: Get Auth URL
app.get("/api/auth/linkedin/url", (req, res) => {
  const isLogin = req.query.login === 'true';
  const userId = req.query.userId as string;
  const redirectUri = `${process.env.APP_URL}/auth/linkedin/callback`;

  const state = JSON.stringify({
    mode: isLogin ? "login" : "connect",
    userId: userId || null
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID || "",
    redirect_uri: redirectUri,
    state: state,
    scope: "w_member_social profile openid email",
  });
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  res.json({ url: authUrl });
});

// Callback: Handle LinkedIn redirect
app.get("/auth/linkedin/callback", async (req, res) => {
  const { code, state: stateJson } = req.query;
  if (!code) return res.status(400).send("No code provided");

  let state: any = {};
  try {
    state = JSON.parse(stateJson as string);
  } catch (e) {
    state = { mode: stateJson }; // Fallback for old state format
  }

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
    if (tokenData.error) {
      console.error("LinkedIn Token Exchange Error:", tokenData);
      throw new Error(`LinkedIn Error: ${tokenData.error_description || tokenData.error}`);
    }

    const accessToken = tokenData.access_token;

    // Get User info
    const userResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = await userResponse.json();
    const userUrn = `urn:li:person:${userData.sub}`;

    // Save to Supabase if we have a userId
    const effectiveUserId = state.userId || userData.sub;

    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: effectiveUserId,
        linkedin_token: accessToken,
        linkedin_urn: userUrn,
        updated_at: new Date().toISOString()
      });

    if (upsertError) {
      console.error("Supabase Upsert Error:", upsertError);
      // Note: If columns don't exist, this will fail. 
      // We'll proceed but the token won't be saved.
    }

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
                    isLogin: ${state.mode === 'login'},
                    user: ${JSON.stringify(userData)},
                    userId: ${JSON.stringify(effectiveUserId)}
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

// API: Search Image (Proxy to avoid CORS and get static URL)
app.get("/api/image/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Query required" });

  try {
    // Clean and limit keywords to improve Unsplash results
    const cleanKeywords = (q as string)
      .replace(/[,]/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join(',');

    const imageUrl = `https://source.unsplash.com/featured/1200x627/?${encodeURIComponent(cleanKeywords)}`;

    // Server-side fetch follows redirects automatically
    const imgRes = await fetch(imageUrl);
    if (imgRes.ok) {
      res.json({ url: imgRes.url });
    } else {
      res.status(500).json({ error: "Unsplash returned an error" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: Check if connected
app.get("/api/auth/linkedin/status", async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.json({ connected: false });

  const { data, error } = await supabase
    .from('profiles')
    .select('linkedin_token')
    .eq('id', userId)
    .single();

  res.json({ connected: !!(data?.linkedin_token) && !error });
});

// API: Post to LinkedIn
app.post("/api/linkedin/post", async (req, res) => {
  const { text, userId, imageUrl } = req.body;
  if (!userId) return res.status(401).json({ error: "User ID required" });

  const { data, error } = await supabase
    .from('profiles')
    .select('linkedin_token, linkedin_urn')
    .eq('id', userId)
    .single();

  if (error || !data?.linkedin_token || !data?.linkedin_urn) {
    console.error("LinkedIn Post - Auth check failed:", { error, userId, hasData: !!data, hasToken: !!data?.linkedin_token, hasUrn: !!data?.linkedin_urn });
    return res.status(401).json({
      error: "Not connected to LinkedIn or profile not found",
      details: error,
      lookupId: userId
    });
  }

  if (!text) return res.status(400).json({ error: "No text provided" });

  try {
    let mediaAsset = null;

    // Handle Image Upload if imageUrl is provided
    if (imageUrl) {
      console.log("Registering image upload to LinkedIn...");
      const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.linkedin_token}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: data.linkedin_urn,
            serviceRelationships: [{
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent"
            }]
          }
        })
      });

      const registerData = await registerRes.json();
      if (!registerRes.ok) throw new Error(`LinkedIn Media Register Error: ${JSON.stringify(registerData)}`);

      const uploadUrl = registerData.value.uploadMechanism["com.linkedin.ads.directUploadV2"].uploadUrl;
      mediaAsset = registerData.value.asset;

      // Download image and upload to LinkedIn
      console.log("Downloading image from Unsplash:", imageUrl);
      const imageRes = await fetch(imageUrl);
      const imageBuffer = await imageRes.arrayBuffer();

      console.log("Uploading image to LinkedIn...");
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${data.linkedin_token}`,
          "Content-Type": "image/jpeg"
        },
        body: imageBuffer
      });

      if (!uploadRes.ok) throw new Error("LinkedIn Image Upload failed");
      console.log("Image uploaded successfully:", mediaAsset);
    }

    // Create the Post (with or without media)
    const specificContent: any = {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: mediaAsset ? "IMAGE" : "NONE",
      }
    };

    if (mediaAsset) {
      specificContent["com.linkedin.ugc.ShareContent"].media = [{
        status: "READY",
        description: { text: "Post image" },
        media: mediaAsset
      }];
    }

    const postResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.linkedin_token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: data.linkedin_urn,
        lifecycleState: "PUBLISHED",
        specificContent,
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });

    const postData = await postResponse.json();
    if (postResponse.ok) {
      res.json({ success: true, data: postData });
    } else {
      console.error("LinkedIn Post API Failure:", postData);
      const errorMessage = postData.message || postData.error_description || JSON.stringify(postData);
      res.status(postResponse.status).json({ success: false, error: { message: errorMessage, details: postData } });
    }
  } catch (err: any) {
    console.error("LinkedIn Post flow Error:", err);
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// Export for Vercel
export default app;

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const startLocal = async () => {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  };
  startLocal();
} else {
  app.use(express.static(path.join(process.cwd(), "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(process.cwd(), "dist", "index.html"));
  });

  if (!process.env.VERCEL) {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Production server running on http://localhost:${PORT}`);
    });
  }
}
