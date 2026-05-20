require("dotenv").config();
const express = require("express");
const { OpenAI } = require("openai");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 8080;
const DO_API_KEY = process.env.DO_API_KEY || "";
const DO_BASE_URL =
  process.env.DO_BASE_URL || "https://cluster-api.do-ai.run/v1";
const DO_MODEL = process.env.DO_MODEL || "meta-llama/Llama-3.3-70B-Instruct";
const ADMIN_PIN = process.env.ADMIN_PIN || "0000";

const client = new OpenAI({ apiKey: DO_API_KEY, baseURL: DO_BASE_URL });

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------
let entries = []; // { id, name, prompt, response, ts, starred }
let sseClients = []; // SSE connections for the display screen

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
// POST /api/prompt — phone submits a prompt
// ---------------------------------------------------------------------------
app.post("/api/prompt", async (req, res) => {
  const { name, prompt } = req.body;
  if (!prompt || prompt.trim().length === 0) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const entry = {
    id: entries.length + 1,
    name: (name || "Anonymous").slice(0, 30),
    prompt: prompt.slice(0, 300),
    response: null,
    ts: Date.now(),
    starred: false,
  };
  entries.push(entry);

  // Broadcast that a new prompt arrived (response pending)
  broadcast("new_prompt", entry);

  try {
    const completion = await client.chat.completions.create({
      model: DO_MODEL,
      max_tokens: 200,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content:
            "You are a creative advertising copywriter. The user will give you a one-sentence creative direction. Respond with ONLY a short, punchy ad tagline for DigitalOcean (max 15 words). No quotes, no explanation, just the tagline.",
        },
        { role: "user", content: entry.prompt },
      ],
    });

    entry.response =
      completion.choices?.[0]?.message?.content?.trim() || "(no response)";
  } catch (err) {
    console.error("Inference error:", err.message);
    entry.response = `⚠️ Error: ${err.message}`;
  }

  // Broadcast the completed entry
  broadcast("response_ready", entry);
  res.json(entry);
});

// ---------------------------------------------------------------------------
// GET /api/entries — fetch all entries (for display page reload)
// ---------------------------------------------------------------------------
app.get("/api/entries", (req, res) => {
  res.json(entries);
});

// ---------------------------------------------------------------------------
// POST /api/star/:id — host stars/unstars an entry (for judging)
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
// POST /api/reset — clear all entries (admin)
// ---------------------------------------------------------------------------
app.post("/api/reset", (req, res) => {
  const { pin } = req.body;
  if (pin !== ADMIN_PIN) return res.status(403).json({ error: "Wrong PIN" });
  entries = [];
  broadcast("reset", {});
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/display", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "display.html"));
});

app.listen(PORT, () => {
  console.log(`Prompt Battle running on http://localhost:${PORT}`);
  console.log(`Phone UI:    http://localhost:${PORT}`);
  console.log(`Big screen:  http://localhost:${PORT}/display`);
  console.log(`Model:       ${DO_MODEL}`);
});
