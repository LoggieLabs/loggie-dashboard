import { Router } from 'express';
import * as geth from '../services/geth.js';
import * as lighthouse from '../services/lighthouse.js';
import * as system from '../services/system.js';
import * as ipfs from '../services/ipfs.js';
import type { NodeStatus } from '../types/index.js';

const router = Router();

router.get('/status', async (_req, res) => {
  try {
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

    res.json(status);
  } catch (error) {
    console.error('Error getting node status:', error);
    res.status(500).json({ error: 'Failed to get node status' });
  }
});

router.get('/health', async (_req, res) => {
  try {
    const [gethHealthy, lighthouseHealthy] = await Promise.all([
      geth.isHealthy().catch(() => false),
      lighthouse.isHealthy().catch(() => false),
    ]);

    res.json({
      healthy: gethHealthy && lighthouseHealthy,
      geth: gethHealthy,
      lighthouse: lighthouseHealthy,
    });
  } catch {
    res.status(503).json({ healthy: false });
  }
});

export default router;
