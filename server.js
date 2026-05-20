require("dotenv").config();
const express = require("express");
const { OpenAI } = require("openai");
const path = require("path");

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 8080;
const DO_API_KEY = process.env.DO_API_KEY || "";
const DO_BASE_URL = process.env.DO_BASE_URL || "https://inference.do-ai.run/v1";
const DO_MODEL = process.env.DO_MODEL || "openai-gpt-oss-120b";
const DO_IMAGE_MODEL = process.env.DO_IMAGE_MODEL || "stable-diffusion-3.5-large";
const ADMIN_PIN = process.env.ADMIN_PIN || "0000";

const client = new OpenAI({ apiKey: DO_API_KEY, baseURL: DO_BASE_URL });

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------
let entries = []; // { id, name, preferences, dishName, imageUrl, votes, ts, starred }
let sseClients = [];
let namesRevealed = false;

// ---------------------------------------------------------------------------
// SSE — live feed for the big screen
// ---------------------------------------------------------------------------
app.get("/api/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("data: connected\n\n");
  sseClients.push(res);
  req.on("close", () => {
    sseClients = sseClients.filter((c) => c !== res);
  });
});

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((c) => c.write(msg));
}

// ---------------------------------------------------------------------------
// POST /api/prompt — phone submits food preferences
// ---------------------------------------------------------------------------
app.post("/api/prompt", async (req, res) => {
  const { name, preferences } = req.body;
  if (!preferences || preferences.trim().length === 0) {
    return res.status(400).json({ error: "Food preferences are required" });
  }

  const entry = {
    id: entries.length + 1,
    name: (name || "Anonymous").slice(0, 30),
    preferences: preferences.slice(0, 300),
    dishName: null,
    imageUrl: null,
    votes: 0,
    ts: Date.now(),
    starred: false,
  };
  entries.push(entry);

  // Broadcast immediately — display shows spinner
  broadcast("new_prompt", entry);

  try {
    // Step 1: Generate creative dish name
    const completion = await client.chat.completions.create({
      model: DO_MODEL,
      max_tokens: 150,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content:
            "You are a creative Michelin-star chef. The user will describe their food preferences or favourite ingredients. Respond with ONLY a short, creative dish name (max 8 words). No explanation, no recipe, just the dish name.",
        },
        { role: "user", content: entry.preferences },
      ],
    });

    entry.dishName =
      completion.choices?.[0]?.message?.content?.trim() || "(unnamed dish)";

    // Broadcast dish name — display updates card while image loads
    broadcast("dish_ready", entry);

    // Step 2: Generate food image
    try {
      const imageResp = await client.images.generate({
        model: DO_IMAGE_MODEL,
        prompt: `A stunning, appetizing food photo of ${entry.dishName}. Professional food photography, beautiful plating, warm lighting, high resolution.`,
        n: 1,
        size: "1024x1024",
      });

      const imageData = imageResp.data?.[0];
      if (imageData?.url) {
        entry.imageUrl = imageData.url;
      } else if (imageData?.b64_json) {
        entry.imageUrl = `data:image/png;base64,${imageData.b64_json}`;
      }
    } catch (imgErr) {
      console.error("Image generation error:", imgErr.message);
      // imageUrl stays null — display shows dish name as fallback
    }
  } catch (err) {
    console.error("Inference error:", err.message);
    entry.dishName = `⚠️ ${err.message}`;
  }

  broadcast("response_ready", entry);
  res.json(entry);
});

// ---------------------------------------------------------------------------
// GET /api/entries — fetch all entries + reveal state (for display page reload)
// ---------------------------------------------------------------------------
app.get("/api/entries", (req, res) => {
  res.json({ entries, namesRevealed });
});

// ---------------------------------------------------------------------------
// POST /api/vote/:id — anyone can vote (no PIN)
// ---------------------------------------------------------------------------
app.post("/api/vote/:id", (req, res) => {
  const entry = entries.find((e) => e.id === parseInt(req.params.id));
  if (!entry) return res.status(404).json({ error: "Not found" });
  entry.votes += 1;
  broadcast("vote_update", entry);
  res.json(entry);
});

// ---------------------------------------------------------------------------
// POST /api/star/:id — host stars/unstars an entry
// ---------------------------------------------------------------------------
app.post("/api/star/:id", (req, res) => {
  const { pin } = req.body;
  if (pin !== ADMIN_PIN) return res.status(403).json({ error: "Wrong PIN" });
  const entry = entries.find((e) => e.id === parseInt(req.params.id));
  if (!entry) return res.status(404).json({ error: "Not found" });
  entry.starred = !entry.starred;
  broadcast("star_toggle", entry);
  res.json(entry);
});

// ---------------------------------------------------------------------------
// POST /api/reveal — toggle name visibility (admin)
// ---------------------------------------------------------------------------
app.post("/api/reveal", (req, res) => {
  const { pin } = req.body;
  if (pin !== ADMIN_PIN) return res.status(403).json({ error: "Wrong PIN" });
  namesRevealed = !namesRevealed;
  broadcast("reveal_toggle", { namesRevealed });
  res.json({ namesRevealed });
});

// ---------------------------------------------------------------------------
// POST /api/reset — clear all entries (admin)
// ---------------------------------------------------------------------------
app.post("/api/reset", (req, res) => {
  const { pin } = req.body;
  if (pin !== ADMIN_PIN) return res.status(403).json({ error: "Wrong PIN" });
  entries = [];
  namesRevealed = false;
  broadcast("reset", {});
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/display", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "display.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.listen(PORT, () => {
  console.log(`Recipe Battle running on http://localhost:${PORT}`);
  console.log(`Phone UI:    http://localhost:${PORT}`);
  console.log(`Big screen:  http://localhost:${PORT}/display`);
  console.log(`Text Model:  ${DO_MODEL}`);
  console.log(`Image Model: ${DO_IMAGE_MODEL}`);
});
