import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import statusRouter from './routes/status.js';
import redisRouter from './routes/redis.js';
import ipfsRouter from './routes/ipfs.js';
import { setupWebSocket } from './websocket.js';

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
});

export default app;
