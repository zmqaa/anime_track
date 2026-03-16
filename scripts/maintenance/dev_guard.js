#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const workspaceRoot = path.resolve(__dirname, '../..');

const PORT = Number(process.env.DEV_GUARD_PORT || process.env.PORT || 38291);
const HOST = process.env.DEV_GUARD_HOST || '0.0.0.0';
const PAGE_PATH = process.env.DEV_GUARD_PAGE || '/login';
const CHECK_INTERVAL_MS = Number(process.env.DEV_GUARD_INTERVAL_MS || 15000);
const REQUEST_TIMEOUT_MS = Number(process.env.DEV_GUARD_TIMEOUT_MS || 10000);
const STARTUP_GRACE_MS = Number(process.env.DEV_GUARD_STARTUP_GRACE_MS || 20000);
const WARMUP_WINDOW_MS = Number(process.env.DEV_GUARD_WARMUP_WINDOW_MS || 45000);
const FAILURE_THRESHOLD = Math.max(1, Number(process.env.DEV_GUARD_FAILURE_THRESHOLD || 2));
const RESTART_BACKOFF_MS = Number(process.env.DEV_GUARD_RESTART_BACKOFF_MS || 2500);
const MAX_RESTARTS = Math.max(1, Number(process.env.DEV_GUARD_MAX_RESTARTS || 20));

if (!Number.isFinite(PORT) || PORT <= 0) {
  console.error('[dev-guard] Invalid port. Please set DEV_GUARD_PORT to a positive number.');
  process.exit(1);
}

if (typeof fetch !== 'function') {
  console.error('[dev-guard] Global fetch is unavailable. Please use Node.js 18+ to run this script.');
  process.exit(1);
}

const baseUrl = `http://127.0.0.1:${PORT}`;

let childProcess = null;
let healthTimer = null;
let failureCount = 0;
let restartCount = 0;
let startupGraceUntil = 0;
let processStartedAt = 0;
let shuttingDown = false;
let restarting = false;

function nowText() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function log(level, message) {
  console.log(`[dev-guard ${level} ${nowText()}] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runHealthCheck() {
  const pageRes = await fetchWithTimeout(`${baseUrl}${PAGE_PATH}`, { redirect: 'manual' });
  if (pageRes.status !== 200) {
    throw new Error(`Page ${PAGE_PATH} returned ${pageRes.status}`);
  }

  const html = await pageRes.text();
  const cssMatch = html.match(/href="([^"]*\/_next\/static\/css\/app\/layout\.css[^"]*)"/i);
  if (!cssMatch?.[1]) {
    throw new Error('Cannot locate layout.css in page HTML');
  }

  const cssPath = cssMatch[1].replace(/&amp;/g, '&').replace(/\\+$/g, '');
  const cssUrl = cssPath.startsWith('http')
    ? cssPath
    : `${baseUrl}${cssPath.startsWith('/') ? '' : '/'}${cssPath}`;

  const cssRes = await fetchWithTimeout(cssUrl, { redirect: 'manual' });
  if (cssRes.status !== 200) {
    throw new Error(`layout.css returned ${cssRes.status}`);
  }

  const contentType = (cssRes.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/css')) {
    throw new Error(`layout.css content-type is ${contentType || 'unknown'}`);
  }
}

function startDevProcess(reason = '') {
  if (shuttingDown) {
    return;
  }

  startupGraceUntil = Date.now() + STARTUP_GRACE_MS;
  processStartedAt = Date.now();

  const args = ['run', 'dev', '--', '--hostname', HOST, '--port', String(PORT)];
  log('INFO', `Starting next dev on ${HOST}:${PORT}${reason ? ` (${reason})` : ''}`);

  childProcess = spawn(npmCommand, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: process.env,
  });

  childProcess.on('exit', (code, signal) => {
    const statusText = signal ? `signal ${signal}` : `code ${code}`;

    if (shuttingDown) {
      log('INFO', `next dev exited (${statusText})`);
      return;
    }

    if (restarting) {
      return;
    }

    log('WARN', `next dev exited unexpectedly (${statusText})`);
    restartDev(`child exited (${statusText})`).catch((error) => {
      log('ERROR', `Restart failed: ${error.message}`);
    });
  });
}

function stopDevProcess() {
  if (!childProcess || childProcess.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const target = childProcess;
    let resolved = false;

    const finalize = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      clearTimeout(forceTimer);
      resolve();
    };

    target.once('exit', finalize);

    const forceTimer = setTimeout(() => {
      if (target.exitCode === null) {
        log('WARN', 'next dev did not exit in time, sending SIGKILL');
        target.kill('SIGKILL');
      }
      finalize();
    }, 10000);

    target.kill('SIGTERM');
  });
}

async function restartDev(reason) {
  if (restarting || shuttingDown) {
    return;
  }

  restarting = true;
  restartCount += 1;

  if (restartCount > MAX_RESTARTS) {
    log('ERROR', `Reached maximum restart limit (${MAX_RESTARTS}), stopping guard.`);
    await shutdown(1);
    return;
  }

  log('WARN', `Restarting next dev (${reason})`);
  await stopDevProcess();
  await sleep(RESTART_BACKOFF_MS);

  failureCount = 0;
  startDevProcess(`restart #${restartCount}`);
  restarting = false;
}

async function healthTick() {
  if (shuttingDown || restarting) {
    return;
  }

  if (!childProcess || childProcess.exitCode !== null) {
    return;
  }

  if (Date.now() < startupGraceUntil) {
    return;
  }

  try {
    await runHealthCheck();
    if (failureCount > 0) {
      log('INFO', `Health recovered after ${failureCount} failure(s).`);
    }
    failureCount = 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    const normalized = message.toLowerCase();
    const uptime = Date.now() - processStartedAt;
    const isTransientWarmupError =
      uptime < WARMUP_WINDOW_MS &&
      (normalized.includes('aborted') || normalized.includes('timed out') || normalized.includes('econnrefused'));

    if (isTransientWarmupError) {
      log('INFO', `Warmup check transient (${Math.round(uptime / 1000)}s): ${message}`);
      return;
    }

    failureCount += 1;
    log('WARN', `Health check failed (${failureCount}/${FAILURE_THRESHOLD}): ${message}`);

    if (failureCount >= FAILURE_THRESHOLD) {
      await restartDev(`health check failed ${failureCount} times`);
    }
  }
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (healthTimer) {
    clearInterval(healthTimer);
  }

  log('INFO', 'Stopping dev guard...');
  await stopDevProcess();
  process.exit(exitCode);
}

process.on('SIGINT', () => {
  shutdown(0).catch((error) => {
    log('ERROR', `Shutdown failed: ${error.message}`);
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  shutdown(0).catch((error) => {
    log('ERROR', `Shutdown failed: ${error.message}`);
    process.exit(1);
  });
});

process.on('uncaughtException', (error) => {
  log('ERROR', `Uncaught exception: ${error.message}`);
  shutdown(1).catch(() => process.exit(1));
});

process.on('unhandledRejection', (error) => {
  const message = error instanceof Error ? error.message : String(error);
  log('ERROR', `Unhandled rejection: ${message}`);
  shutdown(1).catch(() => process.exit(1));
});

startDevProcess();
log('INFO', `Watching ${baseUrl}${PAGE_PATH} every ${CHECK_INTERVAL_MS}ms, threshold=${FAILURE_THRESHOLD}`);

healthTimer = setInterval(() => {
  healthTick().catch((error) => {
    log('ERROR', `Health tick crashed: ${error.message}`);
  });
}, CHECK_INTERVAL_MS);
