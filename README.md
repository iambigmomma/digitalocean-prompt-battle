# ⚡ Prompt Battle

A live, interactive web app for DigitalOcean Masterclass events. Attendees submit creative prompts from their phones, an AI generates taglines via DigitalOcean Serverless Inference, and results appear on the big screen in real time.

## How It Works

```
┌──────────────┐     POST /api/prompt     ┌──────────────┐     OpenAI-compatible     ┌──────────────┐
│   📱 Phone    │ ─────────────────────▶  │   🖥 Server   │ ──────────────────────▶  │  DO Serverless│
│   (attendee)  │ ◀───────────────────── │   (Express)   │ ◀────────────────────── │  Inference    │
└──────────────┘     JSON response        └──────┬───────┘     AI tagline            └──────────────┘
                                                  │ SSE
                                                  ▼
                                          ┌──────────────┐
                                          │   🖥 Display   │
                                          │  (big screen) │
                                          └──────────────┘
```

**Two interfaces:**
- `https://your-app.ondigitalocean.app/` — Phone UI (attendees scan QR code)
- `https://your-app.ondigitalocean.app/display` — Big screen (host opens on projector)

## Quick Start (Local)

```bash
# 1. Clone
git clone https://github.com/YOUR_ORG/prompt-battle.git
cd prompt-battle

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env — add your DO Model Access Key

# 4. Run
npm start

# 5. Open
# Phone UI:    http://localhost:8080
# Big screen:  http://localhost:8080/display
```

## Deploy to DigitalOcean App Platform

### Option A: From the Console

1. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Click **Create App** → connect your GitHub repo
3. App Platform auto-detects the Dockerfile
4. Add environment variables:

| Variable | Value |
|----------|-------|
| `DO_API_KEY` | Your Model Access Key from the SI console |
| `DO_BASE_URL` | `https://cluster-api.do-ai.run/v1` |
| `DO_MODEL` | `meta-llama/Llama-3.3-70B-Instruct` (or any model from the catalog) |
| `ADMIN_PIN` | A 4-digit PIN for the display admin controls |

5. Deploy. Takes ~2 minutes.

### Option B: Using `doctl`

```bash
doctl apps create --spec .do/app.yaml
```

## Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `DO_API_KEY` | (required) | DigitalOcean Model Access Key |
| `DO_BASE_URL` | `https://cluster-api.do-ai.run/v1` | SI endpoint base URL |
| `DO_MODEL` | `meta-llama/Llama-3.3-70B-Instruct` | Model to use for generation |
| `PORT` | `8080` | Server port |
| `ADMIN_PIN` | `0000` | PIN for admin actions on the display page |

### Changing the Model

Swap `DO_MODEL` to any model in the [DO model catalog](https://docs.digitalocean.com/products/genai-platform/). The app uses the OpenAI-compatible Chat Completions API, so any chat model works.

### Changing the Challenge

Edit the system prompt in `server.js` (line ~68) to change what the AI generates:

```javascript
content: "You are a creative advertising copywriter. The user will give you a one-sentence creative direction. Respond with ONLY a short, punchy ad tagline for DigitalOcean (max 15 words). No quotes, no explanation, just the tagline.",
```

## Event Day Checklist

### Before the Event
- [ ] Deploy the app and confirm it's live
- [ ] Test with 3–5 simultaneous phones
- [ ] Set a strong `ADMIN_PIN`
- [ ] Generate a QR code for the app URL (use any QR generator)
- [ ] Print the QR code on A3 poster or add to slides
- [ ] Open `/display` on the projector/big screen laptop

### During the Event
- Open `/display` on the big screen — enter your ADMIN_PIN when prompted
- Show the QR code — attendees scan and start submitting
- ⭐ Star the best entries on the display (click the star icon)
- Use starred entries for the audience vote

### Admin Controls (Display Page)
- **Star/Unstar**: Click ☆ on any entry to highlight it (requires PIN)
- **Reset**: Admin button → Reset All clears everything (for between sessions)

## Architecture

Dead simple by design — no database, no websocket library, no build step.

- **Express** serves both the phone UI and display page
- **Server-Sent Events (SSE)** push updates to the display in real time
- **In-memory array** stores entries (resets on restart — perfect for a 30-min event)
- **OpenAI SDK** calls DO Serverless Inference (OpenAI-compatible API)

## Project Structure

```
prompt-battle/
├── server.js              # Express server + API + SSE
├── public/
│   ├── index.html         # 📱 Phone UI (attendee)
│   └── display.html       # 🖥 Big screen (host)
├── package.json
├── Dockerfile             # For App Platform deployment
├── .env.example           # Environment variable template
└── README.md
```

## License

MIT — use it, fork it, make it your own.
