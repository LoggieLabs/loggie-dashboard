import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import statusRouter from './routes/status.js';
import redisRouter from './routes/redis.js';
import ipfsRouter from './routes/ipfs.js';
import speedtestRouter from './routes/speedtest.js';
import { setupWebSocket } from './websocket.js';
import * as speedtest from './services/speedtest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = parseInt(process.env.PORT || '3000');

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api', statusRouter);
app.use('/api/redis', redisRouter);
app.use('/api/ipfs', ipfsRouter);
app.use('/api/speedtest', speedtestRouter);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));

  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// Setup WebSocket server
setupWebSocket(server);

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   Loggie OS Node Dashboard                                    ║
║                                                               ║
║   Server running on:                                          ║
║   → http://localhost:${PORT}                                      ║
║   → http://0.0.0.0:${PORT} (accessible from network)              ║
║   → ws://localhost:${PORT}/ws (WebSocket)                         ║
║                                                               ║
║   Environment: ${process.env.NODE_ENV || 'development'}                                   ║
║   Geth RPC: ${process.env.GETH_RPC || 'http://localhost:8545'}                ║
║   Lighthouse API: ${process.env.LIGHTHOUSE_API || 'http://localhost:5052'}          ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  // Run one speed test at startup so the panel has an initial reading.
  speedtest.runSpeedTestQuietly();

  // Optional periodic re-test. Set SPEEDTEST_INTERVAL_MIN=0 (default) to disable.
  const intervalMin = parseInt(process.env.SPEEDTEST_INTERVAL_MIN || '0');
  if (intervalMin > 0) {
    setInterval(() => speedtest.runSpeedTestQuietly(), intervalMin * 60_000);
    console.log(`[speedtest] periodic test every ${intervalMin} min`);
  }
});

export default app;
