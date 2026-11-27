# Nomis TTS proxy — deploy (Cloudflare Workers, free plan is enough)

## 0. Rotate your key first
The old key `ft_live_DhdK…` was committed in `app.js` in a public-facing repo. Treat it as leaked:
generate a new key in the FreeTTS dashboard, revoke the old one, and also scrub it from git history
(removing it from the current file does not remove it from past commits).

## 1. Install and log in
    cd worker
    npm i -g wrangler        # or use: npx wrangler <cmd>
    wrangler login

## 2. Set your GitHub Pages origin
Edit `wrangler.toml`:
    ALLOWED_ORIGINS = "https://YOUR-GITHUB-USERNAME.github.io"
Origin = scheme + host only, no path, no trailing slash (a project site at
`https://you.github.io/Nomis/` still has origin `https://you.github.io`). Comma-separate extra origins.
For local testing add `http://localhost:8000` (or your port).

## 3. Store the API key as a secret (never in wrangler.toml or app.js)
    wrangler secret put FREETTS_API_KEY
    # paste the NEW key when prompted

## 4. Test and deploy
    node test/worker.test.mjs        # offline unit tests, mocked FreeTTS
    wrangler deploy
Wrangler prints `https://nomis-tts-proxy.<your-subdomain>.workers.dev`.

## 5. Point the site at it
In `app.js` set:
    const FREETTS_PROXY_URL = 'https://nomis-tts-proxy.<your-subdomain>.workers.dev';
Commit and push. The service worker is cache-first for `app.js`, so bump `CACHE` in `sw.js`
(`nomis-v1` → `nomis-v2`) or hard-refresh, otherwise returning visitors keep the old file.

## 6. Smoke test (replace origin and URL)
    curl -i -X OPTIONS https://nomis-tts-proxy.<sub>.workers.dev \
      -H "Origin: https://YOUR-GITHUB-USERNAME.github.io" \
      -H "Access-Control-Request-Method: POST" \
      -H "Access-Control-Request-Headers: content-type"
Expect `204` with `Access-Control-Allow-Origin`.

    curl -s -X POST https://nomis-tts-proxy.<sub>.workers.dev \
      -H "Origin: https://YOUR-GITHUB-USERNAME.github.io" -H "Content-Type: application/json" \
      -d '{"text":"hello there"}' -o out.mp3 -D -
Expect `200`, `Content-Type: audio/mpeg`, playable `out.mp3`.

## Changing the voice
Default is `en-US-EricNeural` (`DEFAULT_VOICE` in wrangler.toml, `FREETTS_DEFAULT_VOICE` in app.js).
Per browser, no redeploy: `localStorage.setItem('nomis_tts_voice', 'en-US-GuyNeural')`.
Voice ids must match `^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$`; whether FreeTTS accepts a given id is up to FreeTTS.

## Rate and pitch
The frontend sends them only if `FREETTS_RATE` / `FREETTS_PITCH` in `app.js` are numbers (default `null`).
The Worker forwards them as plain numbers in [-100, 100] under the upstream field names `RATE_FIELD` /
`PITCH_FIELD` (defaults `rate` / `pitch`). Those names and units are unverified: check FreeTTS's API docs
and adjust the two vars (or `buildUpstreamPayload` if they want strings like "+10%").

## Firebase
Untouched. The Worker is a separate service and nothing in the Firebase code was modified.
