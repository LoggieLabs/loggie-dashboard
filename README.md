# Loggie OS Node Dashboard

A modern, real-time web dashboard for monitoring Ethereum nodes running Geth + Lighthouse.

## Features

✅ **Real-time Monitoring**
- Geth execution client sync status
- Lighthouse consensus client sync status
- Peer counts and network health
- System resources (disk usage, uptime)

✅ **Auto-updating Dashboard**
- Polls node status every 5 seconds
- Live sync progress bars
- Real-time block/slot counters

✅ **Network Accessible**
- Access from any device on your network
- Responsive design (works on mobile/tablet/desktop)
- Dark mode support

## Architecture

```
┌─────────────────────────────────────────────┐
│  Node (harvey@192.168.1.172)                │
├─────────────────────────────────────────────┤
│  Geth :8545 → Express API :3000 ← Browser  │
│  Lighthouse :5052 ──────────┘               │
└─────────────────────────────────────────────┘
```

## Development

### Prerequisites

- Node.js 18+ and pnpm
- Access to a running Geth + Lighthouse node

### Setup

```bash
cd packages/node-dashboard
pnpm install
```

### Run in Development Mode

```bash
# Start both server and client with hot-reload
pnpm dev

# Or run separately:
pnpm dev:server   # Server on :3000
pnpm dev:client   # Vite dev server on :5173 (proxies to :3000)
```

### Environment Variables

Create a `.env` file:

```env
PORT=3000
GETH_RPC=http://harvey.local:8545
LIGHTHOUSE_API=http://harvey.local:5052
NODE_ENV=development
```

### Build for Production

```bash
pnpm build
```

This creates:
- `dist/server/` - Compiled Express server
- `dist/public/` - Static React build

## Deployment

### Deploy to Harvey Node

```bash
# Build the project
pnpm build

# Deploy script (TODO: create this)
pnpm deploy
```

### Manual Deployment

1. **Build the project**:
   ```bash
   pnpm build
   ```

2. **Copy to node**:
   ```bash
   scp -r dist/ harvey@192.168.1.172:/opt/loggie-dashboard/
   scp package.json harvey@192.168.1.172:/opt/loggie-dashboard/
   ssh harvey@192.168.1.172 "cd /opt/loggie-dashboard && pnpm install --prod"
   ```

3. **Create systemd service** (on the node):
   ```bash
   sudo nano /etc/systemd/system/loggie-dashboard.service
   ```

   ```ini
   [Unit]
   Description=Loggie OS Node Dashboard
   After=network-online.target geth-sepolia.service lighthouse-sepolia.service

   [Service]
   User=harvey
   WorkingDirectory=/opt/loggie-dashboard
   ExecStart=/usr/bin/node dist/server/index.js
   Restart=always
   Environment=PORT=3000
   Environment=GETH_RPC=http://localhost:8545
   Environment=LIGHTHOUSE_API=http://localhost:5052
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```

4. **Start the service**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable loggie-dashboard.service
   sudo systemctl start loggie-dashboard.service
   ```

5. **Access the dashboard**:
   - http://harvey.local:3000
   - http://192.168.1.172:3000

## API Endpoints

### `GET /api/status`

Returns complete node status:

```json
{
  "timestamp": 1699123456789,
  "geth": {
    "version": "Geth/v1.16.7-stable",
    "syncing": true,
    "currentBlock": 9561826,
    "highestBlock": 9561850,
    "peers": 19,
    "syncProgress": 99.75
  },
  "lighthouse": {
    "version": "Lighthouse/v8.0.0",
    "syncing": false,
    "headSlot": 8880210,
    "syncDistance": 0,
    "peers": 13,
    "isOptimistic": false
  },
  "system": {
    "hostname": "dent",
    "uptime": 12345,
    "diskUsage": {
      "total": 1800,
      "used": 450,
      "available": 1350,
      "percentUsed": 25
    },
    "network": {
      "ipAddress": "192.168.1.172"
    }
  }
}
```

### `GET /api/health`

Health check endpoint:

```json
{
  "healthy": true,
  "geth": true,
  "lighthouse": true
}
```

## Tech Stack

**Backend:**
- Express.js - API server
- TypeScript - Type safety
- node-fetch - HTTP client

**Frontend:**
- React 18 - UI framework
- Vite - Build tool & dev server
- Tailwind CSS - Styling
- TypeScript - Type safety

## Project Structure

```
node-dashboard/
├── client/               # React frontend
│   ├── src/
│   │   ├── pages/
│   │   │   └── Dashboard.tsx
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   └── index.html
├── server/               # Express backend
│   ├── routes/
│   │   └── status.ts
│   ├── services/
│   │   ├── geth.ts
│   │   ├── lighthouse.ts
│   │   └── system.ts
│   ├── types/
│   │   └── index.ts
│   └── index.ts
├── scripts/              # Deployment scripts
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tsconfig.server.json
```

## Roadmap

**Phase 1: MVP** (Current)
- [x] Basic dashboard layout
- [x] Real-time sync status
- [x] Peer counts
- [x] System info

**Phase 2: Enhanced Monitoring** (Next)
- [ ] Live log streaming (WebSocket)
- [ ] Historical charts (sync progress over time)
- [ ] Alert notifications
- [ ] Service restart controls

**Phase 3: Advanced Features**
- [ ] Multi-network support (Mainnet/Sepolia/Holesky)
- [ ] Prometheus integration
- [ ] Grafana dashboard export
- [ ] Mobile app (React Native)

## License

MIT
