import fetch from 'node-fetch';
import type {
  LighthouseSyncStatus,
  LighthouseHealth,
  LighthousePeers,
  LighthouseVersion,
} from '../types/index.js';

const LIGHTHOUSE_API = process.env.LIGHTHOUSE_API || 'http://localhost:5052';

async function apiCall(endpoint: string): Promise<any> {
  try {
    const response = await fetch(`${LIGHTHOUSE_API}${endpoint}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Lighthouse API call failed (${endpoint}):`, error);
    throw error;
  }
}

export async function getSyncStatus(): Promise<LighthouseSyncStatus> {
  const data = await apiCall('/eth/v1/node/syncing');
  return data.data;
}

export async function getHealth(): Promise<LighthouseHealth> {
  try {
    const response = await fetch(`${LIGHTHOUSE_API}/eth/v1/node/health`);
    return { status: response.status };
  } catch {
    return { status: 503 };
  }
}

export async function getPeers(): Promise<LighthousePeers> {
  const data = await apiCall('/eth/v1/node/peers');
  return data;
}

export async function getVersion(): Promise<LighthouseVersion> {
  const data = await apiCall('/eth/v1/node/version');
  return { version: data.data.version };
}

export async function isHealthy(): Promise<boolean> {
  const health = await getHealth();
  return health.status === 200;
}
