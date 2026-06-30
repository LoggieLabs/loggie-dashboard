import { Router } from 'express';
import * as redis from '../services/redis.js';

const router = Router();

// Get Redis analytics and metrics
router.get('/analytics', async (_req, res) => {
  try {
    const analytics = await redis.getAnalytics();
    res.json(analytics);
  } catch (error) {
    console.error('Error getting Redis analytics:', error);
    res.status(500).json({ error: 'Failed to get Redis analytics' });
  }
});

// Get all queues
router.get('/queues', async (_req, res) => {
  try {
    const stats = await redis.getAllQueueStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

// Get specific queue details
router.get('/queues/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const stats = await redis.getQueueStats(name);
    const items = await redis.peekQueue(name, 20);

    res.json({
      ...stats,
      items,
    });
  } catch (error) {
    console.error('Error getting queue details:', error);
    res.status(500).json({ error: 'Failed to get queue details' });
  }
});

// Clear a queue
router.delete('/queues/:name', async (req, res) => {
  try {
    const { name } = req.params;
    await redis.clearQueue(name);
    res.json({ success: true, message: `Queue ${name} cleared` });
  } catch (error) {
    console.error('Error clearing queue:', error);
    res.status(500).json({ error: 'Failed to clear queue' });
  }
});

// Get Redis health status
router.get('/health', async (_req, res) => {
  try {
    const healthy = await redis.isHealthy();
    res.json({ healthy });
  } catch (error) {
    res.status(503).json({ healthy: false });
  }
});

export default router;
