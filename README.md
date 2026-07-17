# Loggie OS Node Dashboard

A modern, real-time web dashboard for monitoring any Loggie node — system health,
IPFS, Redis, internet speed, and (optionally) Ethereum clients (Geth + Lighthouse).

_Last updated: 2026-07-17_

## Features

✅ **System Monitoring**
- CPU, memory, temperature, disk usage + live disk I/O
- Mounted drives, network I/O per interface, top processes
- systemd service health (auto-discovered)

✅ **Internet Speed**
- On-demand download / upload / ping / jitter test (**Run test** button)
- Runs once at startup for an initial reading; optional periodic re-test
- Uses Cloudflare's public endpoints — no API key, no extra binary

✅ **Back-end Monitoring**
- IPFS: peer ID, swarm peers, bandwidth, listen addresses
- Redis: analytics + queue inspection
- Ethereum (optional): Geth + Lighthouse sync status, peers, block/slot counters

✅ **Auto-updating & node-agnostic**
- Polls node status every 5 seconds over WebSocket + REST
- **Identity (hostname + IP) is auto-detected** — the same build drops onto any node
- Network accessible, responsive, dark mode

## Architecture

The dashboard runs on each node and monitors that node's local back-ends. It
detects its own hostname/IP at runtime, so nothing is hardcoded per machine.

```
┌──────────────────────── any Loggie node ───────────────────────┐
│  IPFS :5001 ─┐                                                  │
│  Redis :6379 ─┼─→ Express API + WebSocket :3000 ← Browser (LAN) │
│  Geth :8545 ──┤        (also runs internet speed tests)         │
│  Lighthouse :5052 ─┘                                            │
└─────────────────────────────────────────────────────────────────┘
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

All optional — sensible defaults are built in. Node identity (hostname/IP) is
auto-detected and needs no configuration. Create a `.env` (see `.env.example`):

```env
PORT=3000
NODE_ENV=production

# Monitored back-ends — toggle per node
ENABLE_IPFS=true
IPFS_API=http://127.0.0.1:5001
ENABLE_GETH=false
GETH_RPC=http://127.0.0.1:8545
ENABLE_LIGHTHOUSE=false
LIGHTHOUSE_API=http://127.0.0.1:5052
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Internet speed test: minutes between automatic re-tests (0 = manual only)
SPEEDTEST_INTERVAL_MIN=0
```

### Build for Production

```bash
pnpm build
```

This creates:
- `dist/server/` - Compiled Express server
- `dist/public/` - Static React build

## Deployment

### One-command install on a new node (recommended)

`scripts/install-node.sh` is a reusable, auto-detecting installer — nothing is
hardcoded per machine. Clone the repo onto the node and run it once:

```bash
git clone <repo-url> loggie-node-dashboard
cd loggie-node-dashboard
sudo bash scripts/install-node.sh          # add --build to force a rebuild
```

It will:
1. Install Node.js 22 LTS if missing (NodeSource)
2. Build the dashboard (if `dist/` is absent, or with `--build`)
3. Write a `loggie-dashboard` systemd unit that runs from the checkout,
   as the invoking user (`$SUDO_USER`), `Restart=always`, boot-enabled
4. `enable --now` and print the node's URL

It's idempotent — re-run it to pick up a new build or config change. Edit the
`Environment=` lines in `/etc/systemd/system/loggie-dashboard.service` to toggle
which back-ends (IPFS/Redis/Geth/Lighthouse) this node monitors, then
`sudo systemctl restart loggie-dashboard`.

### Updating many nodes at once

`scripts/deploy.sh` builds locally and pushes `dist/` to each host in its node
registry (edit the `NODES=(...)` array), restarting the service over SSH.

### Access

- `http://<node-ip>:3000` (the installer prints the exact URL)

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

### `GET /api/speedtest`

Last cached internet-speed reading plus current state:

```json
{
  "running": false,
  "lastResult": {
    "downloadMbps": 100.1,
    "uploadMbps": 7.7,
    "pingMs": 100.5,
    "jitterMs": 38.4,
    "server": "Cloudflare (speed.cloudflare.com)",
    "testedAt": 1699123456789,
    "durationMs": 13336
  },
  "lastError": null
}
```

### `POST /api/speedtest/run`

Triggers a fresh test and returns the new state when it completes
(`409` if a test is already running). The result is also included as
`speedtest` in `GET /api/status`.

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
│   │   ├── status.ts
│   │   ├── redis.ts
│   │   ├── ipfs.ts
│   │   └── speedtest.ts
│   ├── services/
│   │   ├── geth.ts
│   │   ├── lighthouse.ts
│   │   ├── ipfs.ts
│   │   ├── redis.ts
│   │   ├── speedtest.ts
│   │   └── system.ts
│   ├── types/
│   │   └── index.ts
│   └── index.ts
├── scripts/              # install-node.sh (per-node) + deploy.sh (fleet)
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
