// node --test scripts/vercel-output.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backendOrigin, PRODUCTION_BACKEND, routes } from './vercel-output.mjs';

test('production falls back to the production API', () => {
  assert.equal(backendOrigin({ VERCEL_ENV: 'production' }), PRODUCTION_BACKEND);
  assert.equal(backendOrigin({}), PRODUCTION_BACKEND);
});

test('a preview without BACKEND_ORIGIN fails instead of using production', () => {
  assert.ok(backendOrigin({ VERCEL_ENV: 'preview' }) instanceof Error);
});

test('BACKEND_ORIGIN is used when set and must be a bare https origin', () => {
  assert.equal(backendOrigin({ VERCEL_ENV: 'preview', BACKEND_ORIGIN: 'https://staging-api.example.com/' }),
    'https://staging-api.example.com');
  for (const bad of ['http://x.example.com', 'https://x.example.com/api', 'not a url', 'https://x.example.com?a=1']) {
    assert.ok(backendOrigin({ BACKEND_ORIGIN: bad }) instanceof Error, bad);
  }
});

test('API and crawler routes come before the filesystem; the SPA fallback after it', () => {
  const r = routes('https://api.example.com');
  const fs = r.findIndex(x => x.handle === 'filesystem');
  assert.deepEqual(r[0], { src: '^/api/(.*)$', dest: 'https://api.example.com/api/$1' });
  assert.ok(r.slice(0, fs).every(x => x.dest.startsWith('https://api.example.com/api/')));
  assert.equal(r[fs + 1].dest, '/index.html');
  const movie = r.find(x => x.src === '^/movie/(\\d+)$');
  assert.equal(movie.dest, 'https://api.example.com/api/seo/movie/$1');
  assert.match('Mozilla/5.0 (compatible; Googlebot/2.1)', new RegExp(movie.has[0].value));
  assert.doesNotMatch('Mozilla/5.0 (Windows NT 10.0) Chrome/120', new RegExp(movie.has[0].value));
});
