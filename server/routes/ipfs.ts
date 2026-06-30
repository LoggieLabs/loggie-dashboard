import { Router } from 'express';
import * as ipfs from '../services/ipfs.js';

const router = Router();

router.get('/status', async (_req, res) => {
  const status = await ipfs.getStatus();
  res.json(status);
});

export default router;
