import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

let client: Redis | null = null;

function getClient(): Redis {
  if (!client) {
    client = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      commandTimeout: 3000,
    });
    client.on('error', () => {}); // suppress unhandled error events
  }
  return client;
}

export interface QueueStats {
  name: string;
  length: number;
  memoryUsage?: number;
}

export interface RedisAnalytics {
  healthy: boolean;
  connected_clients: number;
  used_memory: string;
  used_memory_human: string;
  used_memory_peak: string;
  used_memory_peak_human: string;
  total_commands_processed: number;
  instantaneous_ops_per_sec: number;
  total_connections_received: number;
  rejected_connections: number;
  uptime_in_seconds: number;
  uptime_in_days: number;
  keyspace_hits: number;
  keyspace_misses: number;
  hit_rate: number;
  total_keys: number;
}

export async function isHealthy(): Promise<boolean> {
  try {
    const result = await getClient().ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

async function getInfo(): Promise<Record<string, Record<string, string>>> {
  const raw = await getClient().info();
  const parsed: Record<string, Record<string, string>> = {};
  for (const section of raw.split('\r\n\r\n')) {
    const lines = section.split('\r\n');
    const name = lines[0]?.replace('# ', '') || 'general';
    parsed[name] = {};
    for (const line of lines.slice(1)) {
      if (line && !line.startsWith('#')) {
        const idx = line.indexOf(':');
        if (idx !== -1) parsed[name][line.slice(0, idx)] = line.slice(idx + 1);
      }
    }
  }
  return parsed;
}

export async function getAllQueues(): Promise<string[]> {
  try {
    return await getClient().keys('*queue*');
  } catch {
    return [];
  }
}

export async function getQueueStats(queueName: string): Promise<QueueStats> {
  const c = getClient();
  const length = await c.llen(queueName);
  let memoryUsage: number | undefined;
  try {
    const result = await c.memory('USAGE', queueName);
    if (result !== null) memoryUsage = result as number;
  } catch {
    // memory USAGE not always available
  }
  return { name: queueName, length, memoryUsage };
}

export async function getAllQueueStats(): Promise<QueueStats[]> {
  const queues = await getAllQueues();
  return Promise.all(queues.map(q => getQueueStats(q)));
}

export async function peekQueue(queueName: string, count = 10): Promise<string[]> {
  try {
    return await getClient().lrange(queueName, 0, count - 1);
  } catch {
    return [];
  }
}

export async function clearQueue(queueName: string): Promise<void> {
  await getClient().del(queueName);
}

export async function getAnalytics(): Promise<RedisAnalytics> {
  const healthy = await isHealthy();
  const info = await getInfo();
  const totalKeys = (await getClient().keys('*').catch(() => [])).length;

  const stats = info['Stats'] ?? {};
  const clients = info['Clients'] ?? {};
  const memory = info['Memory'] ?? {};
  const server = info['Server'] ?? {};

  const keyspaceHits = parseInt(stats['keyspace_hits'] ?? '0');
  const keyspaceMisses = parseInt(stats['keyspace_misses'] ?? '0');
  const hitRate = keyspaceHits + keyspaceMisses > 0
    ? (keyspaceHits / (keyspaceHits + keyspaceMisses)) * 100
    : 0;

  return {
    healthy,
    connected_clients: parseInt(clients['connected_clients'] ?? '0'),
    used_memory: memory['used_memory'] ?? '0',
    used_memory_human: memory['used_memory_human'] ?? '0B',
    used_memory_peak: memory['used_memory_peak'] ?? '0',
    used_memory_peak_human: memory['used_memory_peak_human'] ?? '0B',
    total_commands_processed: parseInt(stats['total_commands_processed'] ?? '0'),
    instantaneous_ops_per_sec: parseInt(stats['instantaneous_ops_per_sec'] ?? '0'),
    total_connections_received: parseInt(stats['total_connections_received'] ?? '0'),
    rejected_connections: parseInt(stats['rejected_connections'] ?? '0'),
    uptime_in_seconds: parseInt(server['uptime_in_seconds'] ?? '0'),
    uptime_in_days: parseInt(server['uptime_in_days'] ?? '0'),
    keyspace_hits: keyspaceHits,
    keyspace_misses: keyspaceMisses,
    hit_rate: Math.round(hitRate * 100) / 100,
    total_keys: totalKeys,
  };
}
