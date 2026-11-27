/**
 * Nomis FreeTTS proxy — Cloudflare Worker.
 *
 * Browser  --POST JSON-->  this Worker  --POST + x-api-key-->  https://freetts.org/api/v1/tts
 * The Worker answers the CORS preflight itself, keeps the key server-side, and returns audio bytes.
 *
 * Secrets / vars (see ../DEPLOY.md):
 *   FREETTS_API_KEY   secret, required
 *   ALLOWED_ORIGINS   var, required: comma-separated exact origins, e.g. https://yourname.github.io
 *   DEFAULT_VOICE     var, optional, default en-US-EricNeural
 *   MAX_TEXT_CHARS    var, optional, default 5000 (this proxy's own cap, NOT a FreeTTS limit)
 *   RATE_FIELD        var, optional, default "rate"   — UNVERIFIED upstream field name
 *   PITCH_FIELD       var, optional, default "pitch"  — UNVERIFIED upstream field name
 */

const UPSTREAM_URL = 'https://freetts.org/api/v1/tts';
const FORMATS = { mp3: 'audio/mpeg', 'mp3-hd': 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' };
const VOICE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;
const FALLBACK_DEFAULT_VOICE = 'en-US-EricNeural';
const FALLBACK_MAX_CHARS = 5000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/* ───────── pure helpers (checkable without Cloudflare) ───────── */

export function parseAllowedOrigins(value) {
  return String(value || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
}

export function corsHeaders(origin, allowed) {
  const h = { 'Vary': 'Origin' };
  if (origin && allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

/** Returns { ok:true, payload } or { ok:false, error }. Rate/pitch are forwarded only when finite numbers. */
export function buildUpstreamPayload(body, env) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be a JSON object' };
  const maxChars = Number.parseInt(env.MAX_TEXT_CHARS, 10) || FALLBACK_MAX_CHARS;

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return { ok: false, error: 'text is required' };
  if (text.length > maxChars) return { ok: false, error: `text is longer than ${maxChars} characters` };

  const voice = body.voice == null || body.voice === ''
    ? (env.DEFAULT_VOICE || FALLBACK_DEFAULT_VOICE)
    : body.voice;
  if (typeof voice !== 'string' || !VOICE_RE.test(voice)) return { ok: false, error: 'invalid voice id' };

  const format = body.output_format == null ? 'mp3' : body.output_format;
  if (typeof format !== 'string' || !Object.hasOwn(FORMATS, format)) {
    return { ok: false, error: 'output_format must be one of: ' + Object.keys(FORMATS).join(', ') };
  }

  const payload = { text, voice, output_format: format };

  for (const [key, field] of [['rate', env.RATE_FIELD || 'rate'], ['pitch', env.PITCH_FIELD || 'pitch']]) {
    const v = body[key];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: `${key} must be a finite number` };
    if (v < -100 || v > 100) return { ok: false, error: `${key} must be between -100 and 100` };
    payload[field] = v;
  }
  return { ok: true, payload, format };
}

/* ───────── handler ───────── */

function json(status, obj, extra) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

export async function handleRequest(request, env, fetchImpl = fetch) {
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const origin = request.headers.get('Origin') || '';
  const cors = corsHeaders(origin, allowed);

  if (request.method === 'OPTIONS') {
    // Preflight: allowed origin gets 204 with CORS headers; anything else gets 403 without them.
    return cors['Access-Control-Allow-Origin']
      ? new Response(null, { status: 204, headers: cors })
      : new Response(null, { status: 403, headers: cors });
  }
  if (request.method !== 'POST') return json(405, { error: 'method not allowed' }, { ...cors, Allow: 'POST, OPTIONS' });

  // Browsers always send Origin on cross-origin POST; reject unknown ones so the key can't be burned by other sites.
  if (!cors['Access-Control-Allow-Origin']) return json(403, { error: 'origin not allowed' }, cors);
  if (!env.FREETTS_API_KEY) return json(500, { error: 'proxy is missing FREETTS_API_KEY' }, cors);

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'invalid JSON body' }, cors); }
  const built = buildUpstreamPayload(body, env);
  if (!built.ok) return json(400, { error: built.error }, cors);

  let upstream;
  try {
    upstream = await fetchImpl(UPSTREAM_URL, {
      method: 'POST',
      headers: { 'x-api-key': env.FREETTS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(built.payload),
    });
  } catch {
    return json(502, { error: 'could not reach FreeTTS' }, cors);
  }

  const upstreamType = upstream.headers.get('Content-Type') || '';

  // Upstream returned audio directly: pass it through.
  if (upstream.ok && upstreamType.startsWith('audio/')) {
    return new Response(upstream.body, { status: 200, headers: { 'Content-Type': upstreamType, 'Cache-Control': 'no-store', ...cors } });
  }

  const raw = await upstream.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* non-JSON */ }

  if (!upstream.ok) {
    const e = data?.error ?? data?.message ?? data?.detail;
    const msg = typeof e === 'string' ? e : (e && typeof e.message === 'string' ? e.message : raw.replace(/\s+/g, ' ').slice(0, 200));
    return json(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, { error: msg || `FreeTTS HTTP ${upstream.status}` }, cors);
  }

  // Current known contract (from the original app.js): JSON { audio_url }. Fetch the file and return the bytes.
  const audioUrl = data?.audio_url;
  if (typeof audioUrl !== 'string') return json(502, { error: 'FreeTTS response had no audio_url' }, cors);
  let parsed;
  try { parsed = new URL(audioUrl); } catch { return json(502, { error: 'FreeTTS audio_url is not a valid URL' }, cors); }
  if (parsed.protocol !== 'https:') return json(502, { error: 'FreeTTS audio_url is not https' }, cors);

  let audioRes;
  try { audioRes = await fetchImpl(parsed.href); } catch { return json(502, { error: 'could not download generated audio' }, cors); }
  if (!audioRes.ok) return json(502, { error: `audio download failed (HTTP ${audioRes.status})` }, cors);

  const declared = Number.parseInt(audioRes.headers.get('Content-Length') || '', 10);
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) return json(502, { error: 'generated audio is too large' }, cors);

  const type = audioRes.headers.get('Content-Type');
  return new Response(audioRes.body, {
    status: 200,
    headers: {
      'Content-Type': type && type.startsWith('audio/') ? type : FORMATS[built.format],
      'Cache-Control': 'no-store',
      ...cors,
    },
  });
}

export default { fetch: (request, env) => handleRequest(request, env) };
