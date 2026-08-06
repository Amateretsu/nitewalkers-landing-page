import { GameDig } from 'gamedig';
import { writeFile } from 'node:fs/promises';

const OUTPUT_PATH = new URL('../services.json', import.meta.url);
const TIMEOUT_MS = 5000;

const config = JSON.parse(process.env.SERVICE_CHECKS ?? '{}');

async function checkGamedig(host, port, type) {
  await GameDig.query({
    type,
    host,
    port,
    socketTimeout: TIMEOUT_MS,
    attemptTimeout: TIMEOUT_MS + 1000,
    maxRetries: 0,
  });
}

async function checkHttp(host, port, path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`http://${host}:${port}${path ?? '/'}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
}

async function checkService(key, entry) {
  try {
    if (entry.check === 'gamedig') {
      await checkGamedig(entry.host, entry.port, entry.type);
    } else if (entry.check === 'http') {
      await checkHttp(entry.host, entry.port, entry.path);
    } else {
      throw new Error(`unknown check type "${entry.check}"`);
    }
    return true;
  } catch {
    // Deliberately not logging the caught error — it can echo back the
    // host/port being checked, which must not appear in a public log.
    console.log(`${key}: unreachable`);
    return false;
  }
}

const results = {};
for (const [key, entry] of Object.entries(config)) {
  results[key] = await checkService(key, entry);
  console.log(`${key}: ${results[key] ? 'online' : 'offline'}`);
}

const output = {
  updatedAt: new Date().toISOString(),
  services: results,
};

await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
