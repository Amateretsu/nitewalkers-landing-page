import { GameDig } from 'gamedig';
import { writeFile } from 'node:fs/promises';
import { connect } from 'node:net';

const OUTPUT_PATH = new URL('../services.json', import.meta.url);
const TIMEOUT_MS = 5000;

const config = JSON.parse(process.env.SERVICE_CHECKS ?? '{}');

// Plain "is anything listening" check — for servers that don't speak a
// protocol gamedig can query directly (e.g. unlisted/private servers that
// gamedig would otherwise only be able to find via a public master list).
function checkTcp(host, port) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    }, TIMEOUT_MS);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });

    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

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

// Node/undici error `code` values (e.g. ENOTFOUND, ECONNREFUSED, ETIMEDOUT)
// are safe to log — unlike `.message`, they never embed the host/port.
function classify(error) {
  return error.cause?.code ?? error.code ?? error.name ?? 'unknown';
}

async function checkService(key, entry) {
  try {
    if (entry.check === 'gamedig') {
      await checkGamedig(entry.host, entry.port, entry.type);
    } else if (entry.check === 'http') {
      await checkHttp(entry.host, entry.port, entry.path);
    } else if (entry.check === 'tcp') {
      await checkTcp(entry.host, entry.port);
    } else {
      throw new Error(`unknown check type "${entry.check}"`);
    }
    return true;
  } catch (error) {
    console.log(`${key}: unreachable (${classify(error)})`);
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
