#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Loggie Node Dashboard — reusable, auto-detecting installer.
#
# Run ONCE on any fresh Loggie node:
#     sudo bash scripts/install-node.sh
#
# It is fully node-agnostic — nothing is hardcoded per machine:
#   • node identity (hostname + IP) is auto-detected by the dashboard at runtime
#   • the target user is taken from $SUDO_USER (whoever ran sudo)
#   • the service runs straight from this repo checkout (no copy step)
#
# Idempotent: safe to re-run to pick up a new build or config.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SERVICE=loggie-dashboard
UNIT=/etc/systemd/system/${SERVICE}.service

# ── Resolve who/where ─────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run with sudo (needs to install packages + a systemd unit)." >&2
  exit 1
fi
RUN_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # repo = parent of scripts/
echo "==> Installing '$SERVICE'"
echo "    user       : $RUN_USER"
echo "    repo dir   : $REPO_DIR"

# ── 1. Node.js ────────────────────────────────────────────────────────────────
if command -v node >/dev/null 2>&1; then
  echo "==> Node present: $(node -v)"
else
  echo "==> Installing Node.js 22 LTS (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
NODE_BIN="$(command -v node)"

# ── 2. Build (as the run user) if the bundle is missing or --build was passed ──
NEED_BUILD=0
[ ! -f "$REPO_DIR/dist/server/index.js" ] && NEED_BUILD=1
[ "${1:-}" = "--build" ] && NEED_BUILD=1
if [ "$NEED_BUILD" -eq 1 ]; then
  echo "==> Building dashboard (as $RUN_USER)"
  PNPM="$(sudo -u "$RUN_USER" bash -lc 'command -v pnpm || true')"
  if [ -n "$PNPM" ]; then
    sudo -u "$RUN_USER" bash -lc "cd '$REPO_DIR' && pnpm install && pnpm build"
  else
    sudo -u "$RUN_USER" bash -lc "cd '$REPO_DIR' && npm install && npm run build"
  fi
else
  echo "==> Existing build found at dist/ (pass --build to rebuild)"
fi

# ── 3. systemd unit ───────────────────────────────────────────────────────────
# Identity is auto-detected by the app; these env vars only toggle which
# monitored back-ends (IPFS/Redis/Geth/Lighthouse) this node talks to.
echo "==> Writing $UNIT"
cat > "$UNIT" <<EOF
[Unit]
Description=Loggie OS Node Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$REPO_DIR
ExecStart=$NODE_BIN dist/server/index.js
Restart=always
RestartSec=3
Environment=PORT=3000
Environment=NODE_ENV=production
# Monitored back-ends (edit to match this node, then: sudo systemctl restart $SERVICE)
Environment=ENABLE_IPFS=true
Environment=IPFS_API=http://127.0.0.1:5001
Environment=ENABLE_GETH=false
Environment=GETH_RPC=http://127.0.0.1:8545
Environment=ENABLE_LIGHTHOUSE=false
Environment=LIGHTHOUSE_API=http://127.0.0.1:5052
Environment=REDIS_HOST=127.0.0.1
Environment=REDIS_PORT=6379
# Optional: periodic internet speed test, minutes (0 = manual only)
Environment=SPEEDTEST_INTERVAL_MIN=0

[Install]
WantedBy=multi-user.target
EOF

# ── 4. Enable + start ─────────────────────────────────────────────────────────
echo "==> Enabling + starting"
systemctl daemon-reload
systemctl enable --now "$SERVICE"
sleep 2

IP="$(hostname -I | awk '{print $1}')"
echo ""
echo "==> $(systemctl is-active $SERVICE) / $(systemctl is-enabled $SERVICE)"
curl -s -o /dev/null -w "==> http://${IP}:3000  -> HTTP %{http_code}\n" "http://127.0.0.1:3000/" || true
echo ""
echo "Done. Dashboard for $(hostname) is live at http://${IP}:3000"
