import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import * as geth from './services/geth.js';
import * as lighthouse from './services/lighthouse.js';
import * as system from './services/system.js';
import * as redis from './services/redis.js';
import * as ipfs from './services/ipfs.js';
import * as speedtest from './services/speedtest.js';
import type { NodeStatus } from './types/index.js';

const BROADCAST_INTERVAL = 5000;

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  let broadcastInterval: NodeJS.Timeout | null = null;
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
    clients.add(ws);

    sendNodeStatus(ws).catch(console.error);
    sendRedisAnalytics(ws).catch(console.error);

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        handleClientMessage(ws, data).catch(console.error);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      clients.delete(ws);
      if (clients.size === 0 && broadcastInterval) {
        clearInterval(broadcastInterval);
        broadcastInterval = null;
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });

    if (clients.size === 1 && !broadcastInterval) {
      broadcastInterval = setInterval(() => {
        broadcastToAll(clients).catch(console.error);
      }, BROADCAST_INTERVAL);
    }
  });

  console.log('WebSocket server initialized on /ws');
}

async function getNodeStatus(): Promise<NodeStatus> {
  const [
    gethSync,
    gethPeers,
    gethVersion,
    lighthouseSync,
    lighthousePeers,
    lighthouseVersion,
    systemInfo,
    ipfsStatus,
  ] = await Promise.all([
    geth.getSyncStatus().catch(() => null),
    geth.getPeerCount().catch(() => null),
    geth.getVersion().catch(() => null),
    lighthouse.getSyncStatus().catch(() => null),
    lighthouse.getPeers().catch(() => null),
    lighthouse.getVersion().catch(() => null),
    system.getSystemInfo(),
    ipfs.getStatus(),
  ]);

  const status: NodeStatus = {
    timestamp: Date.now(),
    system: systemInfo,
    ipfs: ipfsStatus,
    speedtest: speedtest.getState().lastResult,
  };

  if (gethSync !== null && gethPeers !== null && gethVersion !== null) {
    const currentBlock = parseInt(gethSync.currentBlock, 16);
    const highestBlock = parseInt(gethSync.highestBlock, 16);
    const syncProgress = highestBlock > 0 ? (currentBlock / highestBlock) * 100 : 0;
    status.geth = {
      version: gethVersion.version,
      syncing: gethSync.syncing,
      currentBlock,
      highestBlock,
      peers: gethPeers.count,
      syncProgress: Math.min(syncProgress, 100),
    };
  }

  if (lighthouseSync !== null && lighthousePeers !== null && lighthouseVersion !== null) {
    status.lighthouse = {
      version: lighthouseVersion.version,
      syncing: lighthouseSync.is_syncing,
      headSlot: parseInt(lighthouseSync.head_slot),
      syncDistance: parseInt(lighthouseSync.sync_distance),
      peers: lighthousePeers.meta.count,
      isOptimistic: lighthouseSync.is_optimistic,
    };
  }

  return status;
}

async function sendNodeStatus(ws: WebSocket) {
  try {
    const status = await getNodeStatus();
    send(ws, { type: 'node_status', data: status });
  } catch (error) {
    console.error('Error fetching node status:', error);
  }
}

async function sendRedisAnalytics(ws: WebSocket) {
  try {
    const analytics = await redis.getAnalytics();
    send(ws, { type: 'redis_analytics', data: analytics });
  } catch {
    // Redis not available
  }
}

async function sendRedisQueues(ws: WebSocket) {
  try {
    const queues = await redis.getAllQueueStats();
    send(ws, { type: 'redis_queues', data: queues });
  } catch {
    // Redis not available
  }
}

async function broadcastToAll(clients: Set<WebSocket>) {
  const [nodeStatusResult, redisAnalyticsResult, redisQueuesResult] = await Promise.allSettled([
    getNodeStatus(),
    redis.getAnalytics(),
    redis.getAllQueueStats(),
  ]);

  const messages: Array<{ type: string; data: unknown }> = [];

  if (nodeStatusResult.status === 'fulfilled') {
    messages.push({ type: 'node_status', data: nodeStatusResult.value });
  }
  if (redisAnalyticsResult.status === 'fulfilled') {
    messages.push({ type: 'redis_analytics', data: redisAnalyticsResult.value });
  }
  if (redisQueuesResult.status === 'fulfilled') {
    messages.push({ type: 'redis_queues', data: redisQueuesResult.value });
  }

  for (const message of messages) {
    const json = JSON.stringify(message);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    }
  }
}

async function handleClientMessage(ws: WebSocket, message: any) {
  switch (message.type) {
    case 'subscribe_node':
      await sendNodeStatus(ws);
      break;
    case 'subscribe_redis':
      await sendRedisAnalytics(ws);
      await sendRedisQueues(ws);
      break;
    case 'get_queue_details':
      if (message.queueName) {
        try {
          const stats = await redis.getQueueStats(message.queueName);
          const items = await redis.peekQueue(message.queueName, 20);
          send(ws, { type: 'queue_details', data: { ...stats, items } });
        } catch (error) {
          send(ws, { type: 'error', message: `Failed to get queue details: ${error}` });
        }
      }
      break;
    case 'clear_queue':
      if (message.queueName) {
        try {
          await redis.clearQueue(message.queueName);
          send(ws, { type: 'queue_cleared', queueName: message.queueName });
          await sendRedisQueues(ws);
        } catch (error) {
          send(ws, { type: 'error', message: `Failed to clear queue: ${error}` });
        }
      }
      break;
    default:
      console.log('Unknown message type:', message.type);
  }
}

function send(ws: WebSocket, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
