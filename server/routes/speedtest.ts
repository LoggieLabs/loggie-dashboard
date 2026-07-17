import { Router } from 'express';
import * as speedtest from '../services/speedtest.js';

const router = Router();

// Last cached result + current running/error state.
router.get('/', (_req, res) => {
  res.json(speedtest.getState());
});

// Trigger a fresh test. Returns the new state (409 if one is already running).
router.post('/run', async (_req, res) => {
  if (speedtest.getState().running) {
    return res.status(409).json(speedtest.getState());
  }
  try {
    await speedtest.runSpeedTest();
    res.json(speedtest.getState());
  } catch {
    res.status(500).json(speedtest.getState());
  }
});

export default router;
