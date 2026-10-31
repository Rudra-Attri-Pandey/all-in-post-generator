/* All-in-One Social Post Generator backend — Express server.
 * Modes:
 *   - AI mode:       GEMINI_API_KEY set. Returns Gemini-written captions
 *                    with { ai:true }.
 *   - Template mode: no key configured. Returns the local tone-template
 *                    generator output verbatim with { ai:false } + notice.
 *                    NEVER labels templates as AI.
 * Honest limits: this server writes TEXT (captions, hashtags, media_prompts).
 * It does NOT render images, video, or music — media_prompts are paste-ready
 * text the user can feed to any image generator.
 */
'use strict';

require('dotenv').config();
const path = require('path');
const net = require('net');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const APP_DIR = __dirname;
const GEMINI_KEY = (process.env.GEMINI_API_KEY || '').trim();
const AI_MODE = Boolean(GEMINI_KEY);

const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3011')
  .split(',').map((s) => s.trim()).filter(Boolean);

const ALLOWED_TONES = ['hype', 'professional', 'casual', 'educational'];
const ALLOWED_PLATFORMS = ['x', 'linkedin', 'instagram', 'tiktok'];

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// --- Security middleware -------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl / non-browser
    if (CORS_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS origin not allowed'));
  },
}));
app.use(express.json({ limit: '10kb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: 'draft-7' }));

// Sensitive-file guard: never expose secrets or server internals.
const SENSITIVE = /(\.env(\.|$)|package(-lock)?\.json|(\/|^)server\.js$|\.map$)/i;
app.use((req, res, next) => {
  if (SENSITIVE.test(req.path)) return res.status(404).json({ error: 'Not found' });
  next();
});
app.use(express.static(APP_DIR, { dotfiles: 'deny', index: 'index.html' }));

// --- Local tone-template generator (VERBATIM from the frontend mock) ------
// Used ONLY for honest keyless fallback, always with ai:false + notice.
function generateSocialCopies(prompt, tone) {
  let x = '';
  let li = '';
  let ig = '';
  let tk = [];

  const cleanPrompt = prompt.replace(/[#]/g, '');

  if (tone === 'hype') {
    x = `🚨 MASSIVE NEWS! 🚨\n\n${cleanPrompt} is officially happening! We've been working day and night on this and can't wait to share it. \n\nGet ready for the launch. It's going to be wild! 🚀💥\n\n#launch #buildinpublic`;
    li = `💥 BIG ANNOUNCEMENT! 💥\n\nWe are thrilled to share that: ${cleanPrompt} is launching soon!\n\nThis marks a huge milestone for our team. We've compiled state-of-the-art architectures to make this happen. \n\nHere is what you need to know:\n1️⃣ Built on high-performance frameworks.\n2️⃣ Custom AI configurations.\n3️⃣ Fully open-source.\n\nJoin the waitlist now! 🚀\n\n#milestone #startups #innovation`;
    ig = `🚨 IT'S FINALLY HAPPENING! 🚨\n\nWe're bringing ${cleanPrompt} to life! Swipe left to check the key features. Tell us what you think in the comments! 👇\n\n#newlaunch #designinspiration #coding #developer #creatives`;
    tk = ['🚨 ATTENTION DEVELOPERS! 🚨', 'We are launching something MASSIVE.', 'Say hello to our new AI workflow.', "It's fully open-source and fast.", 'Link in bio to join today! 🚀'];
  } else if (tone === 'professional') {
    x = `We are pleased to introduce our latest development:\n\n${cleanPrompt}.\n\nBy leveraging advanced machine learning integrations, this project establishes a new standard for modern workflows. Learn more: \n\n#tech #artificialintelligence`;
    li = `💼 Product Update & Technical Breakdown:\n\nWe are proud to share our latest project: ${cleanPrompt}.\n\nThis release solves critical productivity gaps by offering automated pipeline generation and structured formatting options.\n\nWe invite our professional community to explore the repository and share feedback on the integration features.\n\n#businessintelligence #engineering #softwarearchitecture`;
    ig = `We are proud to announce: ${cleanPrompt}.\n\nDesigned for modern engineering teams looking to accelerate their design and code deliveries. Read details on our website.\n\n#productdevelopment #remotework #b2b #fintech`;
    tk = ['Announcing our latest system update.', 'Designed for engineering teams.', 'Optimizes pipeline structures.', 'Implements custom design models.', 'Explore the repository today.'];
  } else {
    // Casual / Educational
    x = `Quick thoughts on ${cleanPrompt}:\n\nWe wanted something simple, modular, and fast. So we built it ourselves. Check out how it works! 👇\n\n#developers #buildinpublic`;
    li = `💡 How we solved a major itch problem:\n\nWe were struggling with standard workflows, so we built: ${cleanPrompt}.\n\nNo bloat. No complex configuration. Just clean, raw files that execute in seconds.\n\nHere is a quick look at the stack we used to compile this MVP.\n\n#programming #productivity #coder`;
    ig = `Solving coding problems, one block at a time. 💻 We built ${cleanPrompt} to help teams build faster. Drop your questions below!\n\n#developerlife #codingbootcamp #techstartups #uidesign`;
    tk = ['Ever struggled with manual workflows?', 'We decided to fix it ourselves.', 'Here is our new automated tool.', 'It writes clean code in seconds.', 'Try it out and tell us your thoughts!'];
  }

  return { x, li, ig, tk };
}

// --- Shared helpers -------------------------------------------------------
function clampX(s) {
  s = String(s || '');
  return s.length > 280 ? s.slice(0, 277) + '...' : s;
}

function extractHashtags(copies) {
  const seen = new Set();
  const out = [];
  const texts = [];
  for (const v of Object.values(copies || {})) {
    if (Array.isArray(v)) texts.push(...v);
    else if (typeof v === 'string') texts.push(v);
  }
  for (const t of texts) {
    const m = String(t).match(/#[A-Za-z0-9_]+/g) || [];
    for (const h of m) {
      const k = h.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(h); }
    }
  }
  return out.slice(0, 12);
}

function templateMediaPrompts(cleanPrompt, tone, platforms) {
  const short = cleanPrompt.length > 140 ? cleanPrompt.slice(0, 137) + '...' : cleanPrompt;
  const aspects = {
    x: 'wide 16:9 banner',
    linkedin: 'wide 16:9 professional banner',
    instagram: 'square 1:1 feed artwork',
    tiktok: 'vertical 9:16 video backdrop',
  };
  const mp = {};
  for (const p of platforms) {
    mp[p] = `Social-media artwork prompt (${tone} style, ${aspects[p]}): "${short}" — bold flat composition, high contrast, no watermark, no readable text. Paste into any image generator; this server renders no images.`;
  }
  return mp;
}

function buildTemplateResponse(prompt, tone, platforms) {
  const t = generateSocialCopies(prompt, tone);
  const copies = {};
  if (platforms.includes('x')) copies.x = clampX(t.x);
  if (platforms.includes('linkedin')) copies.linkedin = t.li;
  if (platforms.includes('instagram')) copies.instagram = t.ig;
  if (platforms.includes('tiktok')) copies.tiktok = t.tk;
  const cleanPrompt = String(prompt).replace(/[#]/g, '');
  return {
    copies,
    hashtags: extractHashtags(copies),
    media_prompts: templateMediaPrompts(cleanPrompt, tone, platforms),
    platforms,
    tones: [tone],
    ai: false,
    notice: 'Template mode — local tone templates, not AI. Add GEMINI_API_KEY for AI captions. Images, video, and music are NOT generated; media_prompts are paste-ready text for any image generator.',
  };
}

// --- Gemini ---------------------------------------------------------------
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];

function buildGeminiPrompt(prompt, tones, platforms) {
  return (
    'You are a professional social media manager. Write per-platform captions.\n'
    + `Campaign brief: """${prompt}"""\n`
    + `Requested tone(s): ${tones.join(', ')}.\n`
    + `Requested platforms: ${platforms.join(', ')}.\n`
    + 'Rules: the "x" post MUST be 280 characters or fewer. "tiktok" MUST be an array of 4-5 short video slide captions. '
    + '"media_prompts" MUST be an object with one paste-ready image-generator prompt per requested platform.\n'
    + 'Return ONLY a JSON object (no markdown, no prose) with keys: '
    + '{"x": string, "linkedin": string, "instagram": string, "tiktok": string[], '
    + '"hashtags": string[], "media_prompts": {"x": string, "linkedin": string, "instagram": string, "tiktok": string}}. '
    + 'Include only the requested platforms; always include "hashtags" and "media_prompts".'
  );
}

function extractJsonObject(raw) {
  const s = String(raw || '').replace(/```json|```/g, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

function sanitizeAiResponse(parsed, platforms) {
  if (!parsed || typeof parsed !== 'object') return null;
  const copies = {};
  if (platforms.includes('x') && typeof parsed.x === 'string' && parsed.x.trim()) {
    copies.x = clampX(parsed.x.trim());
  }
  for (const p of ['linkedin', 'instagram']) {
    if (platforms.includes(p) && typeof parsed[p] === 'string' && parsed[p].trim()) {
      copies[p] = parsed[p].trim().slice(0, 3000);
    }
  }
  if (platforms.includes('tiktok')) {
    let tk = parsed.tiktok;
    if (typeof tk === 'string') tk = [tk];
    if (Array.isArray(tk)) {
      tk = tk.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim().slice(0, 200)).slice(0, 6);
      if (tk.length) copies.tiktok = tk;
    }
  }
  if (!Object.keys(copies).length) return null;
  let hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.filter((h) => typeof h === 'string' && h.trim()).map((h) => (h.trim().startsWith('#') ? h.trim() : '#' + h.trim()).slice(0, 40)).slice(0, 12)
    : [];
  if (!hashtags.length) hashtags = extractHashtags(copies);
  let mediaPrompts = {};
  const rawMp = parsed.media_prompts && typeof parsed.media_prompts === 'object' ? parsed.media_prompts : {};
  for (const p of platforms) {
    if (typeof rawMp[p] === 'string' && rawMp[p].trim()) mediaPrompts[p] = rawMp[p].trim().slice(0, 1000);
  }
  return { copies, hashtags, media_prompts: mediaPrompts };
}

async function callGemini(prompt, tones, platforms) {
  const body = {
    contents: [{ parts: [{ text: buildGeminiPrompt(prompt, tones, platforms) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 2000 },
  };
  let lastErr = null;
  let data = null;
  for (const model of GEMINI_MODELS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal }
      );
      if (r.ok) { data = await r.json(); lastErr = null; break; }
      lastErr = new Error(`Gemini ${model} HTTP ${r.status}`);
      if (r.status === 400) break; // bad request/key — another model won't help
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastErr) throw lastErr;
  const text = data && data.candidates && data.candidates[0] && data.candidates[0].content
    && data.candidates[0].content.parts && data.candidates[0].content.parts.map((p) => p.text || '').join('');
  const clean = sanitizeAiResponse(extractJsonObject(text), platforms);
  if (!clean) throw new Error('Gemini returned unparseable JSON');
  return clean;
}

// --- API ------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: AI_MODE ? 'ai' : 'template', ai: AI_MODE, simulated: false });
});

app.post('/api/generate', async (req, res) => {
  const { prompt, tone, tones, platforms } = req.body || {};

  // Validate prompt
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Missing "prompt": provide a non-empty campaign description.' });
  }
  if (prompt.length > 2000) {
    return res.status(400).json({ error: 'Prompt exceeds 2000 character limit.' });
  }

  // Validate tones (accept single `tone` or `tones[]`; default hype)
  let toneList;
  if (Array.isArray(tones)) toneList = tones;
  else if (typeof tone === 'string' && tone) toneList = [tone];
  else toneList = ['hype'];
  if (!toneList.length) return res.status(400).json({ error: '"tones" must be a non-empty array.' });
  for (const t of toneList) {
    if (!ALLOWED_TONES.includes(t)) {
      return res.status(400).json({ error: `Invalid tone "${String(t).slice(0, 40)}". Allowed: ${ALLOWED_TONES.join(', ')}.` });
    }
  }

  // Validate platforms (default: all four)
  const plats = Array.isArray(platforms) ? platforms : ['x', 'linkedin', 'instagram', 'tiktok'];
  if (!plats.length) return res.status(400).json({ error: '"platforms" must be a non-empty array.' });
  for (const p of plats) {
    if (!ALLOWED_PLATFORMS.includes(p)) {
      return res.status(400).json({ error: `Invalid platform "${String(p).slice(0, 40)}". Allowed: ${ALLOWED_PLATFORMS.join(', ')}.` });
    }
  }

  const cleanPrompt = prompt.trim();
  const primaryTone = toneList[0];

  // AI path when a key is configured; honest template fallback on failure.
  if (AI_MODE) {
    try {
      const ai = await callGemini(cleanPrompt, toneList, plats);
      return res.json({
        copies: ai.copies,
        hashtags: ai.hashtags,
        media_prompts: ai.media_prompts,
        platforms: plats,
        tones: toneList,
        ai: true,
        provider: 'gemini',
      });
    } catch (e) {
      const fb = buildTemplateResponse(cleanPrompt, primaryTone, plats);
      fb.notice = `AI generation failed (${(e && e.message) || e}); showing local tone templates instead. Check GEMINI_API_KEY and retry.`;
      return res.json(fb);
    }
  }
  return res.json(buildTemplateResponse(cleanPrompt, primaryTone, plats));
});

// --- Boot: PORT or first free 30xx ----------------------------------------
function listenOn(port) {
  if (port > 3099) { console.error('No free port in 3011-3099.'); process.exit(1); }
  const server = net.createServer();
  server.once('error', () => listenOn(port + 1));
  server.once('listening', () => {
    server.close(() => {
      app.listen(port, () => {
        console.log(`[postgen] listening on http://localhost:${port}`);
        console.log(`[postgen] mode: ${AI_MODE ? 'AI (provider: gemini)' : 'TEMPLATE (no GEMINI_API_KEY set — add one for AI captions)'}`);
        console.log(`[postgen] CORS origins: ${CORS_ORIGINS.join(', ')}`);
      });
    });
  });
  server.listen(port);
}
module.exports = app;

// Guarded so `require('./server')` (e.g. serverless) does not start a listener.
// Direct `node server.js` behavior is unchanged.
if (require.main === module) {
  listenOn(Number(process.env.PORT) || 3011);
}
