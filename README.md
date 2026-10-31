# All-in-One Social Post Generator (real backend)

Express backend + static frontend. One prompt in, per-platform captions out.

## Run

```bash
npm install
npm start        # http://localhost:3011 (or first free 3011-3099)
```

Optional AI captions: copy `.env.example` to `.env` and set `GEMINI_API_KEY`. Keyless servers work in honest template mode.

| Var | Default |
| --- | --- |
| `GEMINI_API_KEY` | _(empty = template mode)_ |
| `PORT` | `3011` |
| `CORS_ORIGINS` | `http://localhost:3011` |

Deploy: `vercel.json` routes everything through `server.js`.

## API

`POST /api/generate` — body `{ prompt, tones[], platforms[] }` (single `tone` string also accepted).

- `prompt`: non-empty, ≤2000 chars (else 400).
- `tones`: subset of `hype, professional, casual, educational` (else 400).
- `platforms`: non-empty subset of `x, linkedin, instagram, tiktok` (else 400).
- Returns `{ copies, hashtags[], media_prompts, platforms, tones, ai, provider? , notice? }`.
- X copy is clamped to ≤280 chars server-side, AI or template.
- `GET /api/health` → `{ ok, mode: "ai" | "template", ai }`.

## Honest capability list

- REAL: per-platform captions (Gemini AI when `GEMINI_API_KEY` is set, local tone templates otherwise — always labeled via `ai:true/false`); X ≤280 enforcement; per-platform image prompts as paste-ready text (`media_prompts`); `.TXT` / `.MD` / `.JSON` bundle download, copy-all, copy-hashtags; platform checkboxes and char counters in the UI.
- NOT real (labeled placeholders in the UI): AI images, slideshow video rendering, music overlay, ZIP export (exports are real text files with honest extensions).
