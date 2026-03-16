#!/usr/bin/env node

const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:38291').replace(/\/$/, '');

const checks = [
  { name: 'home', method: 'GET', path: '/', expected: [200, 302, 307] },
  { name: 'anime page', method: 'GET', path: '/anime', expected: [200, 302, 307] },
  { name: 'anime api', method: 'GET', path: '/api/anime', expected: [200, 302, 307, 401, 403] },
  {
    name: 'quick record api',
    method: 'POST',
    path: '/api/anime/quick-record',
    body: { text: '今天看了 测试番 第一集' },
    expected: [200, 302, 307, 400, 401, 403],
  },
  {
    name: 'enrich api',
    method: 'POST',
    path: '/api/anime/1/enrich',
    expected: [200, 302, 307, 401, 403, 404],
  },
];

async function checkOne(def) {
  const url = `${baseUrl}${def.path}`;
  const options = {
    method: def.method,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json' },
  };

  if (def.body) {
    options.body = JSON.stringify(def.body);
  }

  const res = await fetch(url, options);
  const text = await res.text();

  if (res.status === 500) {
    throw new Error(`${def.name} returned 500 at ${url}`);
  }

  if (!def.expected.includes(res.status)) {
    throw new Error(`${def.name} unexpected status ${res.status} at ${url}`);
  }

  console.log(`[OK] ${def.name}: ${res.status}`);
  if (text && text.length < 160) {
    console.log(`     body: ${text.replace(/\s+/g, ' ').trim()}`);
  }
}

(async () => {
  console.log(`Smoke check base URL: ${baseUrl}`);
  for (const item of checks) {
    await checkOne(item);
  }
  console.log('All smoke checks passed.');
})().catch((error) => {
  console.error('Smoke check failed:', error.message);
  process.exit(1);
});
