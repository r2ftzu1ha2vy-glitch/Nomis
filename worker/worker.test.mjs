import assert from 'node:assert/strict';
import { handleRequest, buildUpstreamPayload } from '../src/index.js';

const env = { FREETTS_API_KEY: 'k', ALLOWED_ORIGINS: 'https://me.github.io' };
const req = (method, body, origin = 'https://me.github.io') => new Request('https://w.example/', {
  method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});

// preflight
let r = await handleRequest(req('OPTIONS'), env);
assert.equal(r.status, 204);
assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://me.github.io');
assert.equal((await handleRequest(req('OPTIONS', undefined, 'https://evil.example'), env)).status, 403);

// payload
assert.equal(buildUpstreamPayload({ text: 'hi' }, env).payload.voice, 'en-US-EricNeural');
assert.deepEqual(buildUpstreamPayload({ text: 'hi', voice: 'en-US-GuyNeural', rate: 10, pitch: -5 }, env).payload,
  { text: 'hi', voice: 'en-US-GuyNeural', output_format: 'mp3', rate: 10, pitch: -5 });
assert.equal(buildUpstreamPayload({ text: '' }, env).ok, false);
assert.equal(buildUpstreamPayload({ text: 'x', voice: '../x' }, env).ok, false);
assert.equal(buildUpstreamPayload({ text: 'x', rate: NaN }, env).ok, false);

// happy path with mocked upstream
let seen;
const mock = async (url, opts) => {
  if (url === 'https://freetts.org/api/v1/tts') {
    seen = { headers: opts.headers, body: JSON.parse(opts.body) };
    return new Response(JSON.stringify({ audio_url: 'https://cdn.example/a.mp3' }), { headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } });
};
r = await handleRequest(req('POST', { text: 'hello', rate: 5 }), env, mock);
assert.equal(r.status, 200);
assert.equal(r.headers.get('Content-Type'), 'audio/mpeg');
assert.equal((await r.arrayBuffer()).byteLength, 3);
assert.equal(seen.headers['x-api-key'], 'k');
assert.equal(seen.body.voice, 'en-US-EricNeural');
assert.equal(seen.body.rate, 5);

// upstream error passthrough
r = await handleRequest(req('POST', { text: 'hello' }), env, async () => new Response(JSON.stringify({ error: 'bad voice' }), { status: 400 }));
assert.equal(r.status, 400);
assert.equal((await r.json()).error, 'bad voice');

// foreign origin POST
assert.equal((await handleRequest(req('POST', { text: 'x' }, 'https://evil.example'), env, mock)).status, 403);
console.log('all worker tests passed');
