import { performance } from 'node:perf_hooks';
import type { SpeedTestResult, SpeedTestState } from '../types/index.js';

// Uses Cloudflare's public speed-test backend (no API key, no binary to install).
// Same endpoints that speed.cloudflare.com drives from the browser.
const DOWNLOAD_URL = 'https://speed.cloudflare.com/__down';
const UPLOAD_URL = 'https://speed.cloudflare.com/__up';
const SERVER_LABEL = 'Cloudflare (speed.cloudflare.com)';

// Transfer sizes — a full run moves ~35 MB and takes a few seconds.
const DOWNLOAD_BYTES = 25_000_000;
const UPLOAD_BYTES = 10_000_000;
const PING_SAMPLES = 6;
const FETCH_TIMEOUT_MS = 30_000;

let running = false;
let lastResult: SpeedTestResult | null = null;
let lastError: string | null = null;

export function getState(): SpeedTestState {
  return { running, lastResult, lastError };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

async function measurePing(samples = PING_SAMPLES): Promise<{ pingMs: number; jitterMs: number }> {
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    try {
      const res = await fetch(`${DOWNLOAD_URL}?bytes=0`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      await res.arrayBuffer();
      times.push(performance.now() - start);
    } catch {
      // drop failed sample
    }
  }
  if (times.length === 0) return { pingMs: 0, jitterMs: 0 };
  // Drop the slowest sample (usually the DNS/TLS warm-up) when we have enough.
  times.sort((a, b) => a - b);
  const kept = times.length > 3 ? times.slice(0, -1) : times;
  const avg = kept.reduce((s, t) => s + t, 0) / kept.length;
  const jitter = kept.reduce((s, t) => s + Math.abs(t - avg), 0) / kept.length;
  return { pingMs: round1(avg), jitterMs: round1(jitter) };
}

async function measureDownload(bytes: number): Promise<number> {
  const start = performance.now();
  const res = await fetch(`${DOWNLOAD_URL}?bytes=${bytes}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  let received = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
  }
  const seconds = (performance.now() - start) / 1000;
  if (seconds <= 0) return 0;
  return (received * 8) / seconds / 1e6; // Mbps
}

async function measureUpload(bytes: number): Promise<number> {
  const payload = new Uint8Array(bytes); // zero-filled body is fine for throughput
  const start = performance.now();
  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    body: payload,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  await res.arrayBuffer();
  if (!res.ok) throw new Error(`upload failed: HTTP ${res.status}`);
  const seconds = (performance.now() - start) / 1000;
  if (seconds <= 0) return 0;
  return (bytes * 8) / seconds / 1e6; // Mbps
}

export async function runSpeedTest(): Promise<SpeedTestResult> {
  if (running) throw new Error('A speed test is already running');
  running = true;
  lastError = null;
  const testedAt = Date.now();
  const t0 = performance.now();
  try {
    const { pingMs, jitterMs } = await measurePing();
    // Warm up the connection so slow-start doesn't skew the download reading.
    await measureDownload(1_000_000).catch(() => 0);
    const downloadMbps = await measureDownload(DOWNLOAD_BYTES);
    const uploadMbps = await measureUpload(UPLOAD_BYTES);

    lastResult = {
      downloadMbps: round1(downloadMbps),
      uploadMbps: round1(uploadMbps),
      pingMs,
      jitterMs,
      server: SERVER_LABEL,
      testedAt,
      durationMs: Math.round(performance.now() - t0),
    };
    return lastResult;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    running = false;
  }
}

// Fire-and-forget helpers used at startup / on a timer.
export function runSpeedTestQuietly(): void {
  if (running) return;
  runSpeedTest().catch((err) => {
    console.warn('[speedtest] background run failed:', err instanceof Error ? err.message : err);
  });
}
