#!/bin/bash
# Deploy loggie-node-dashboard to all Loggie nodes.
# Run from the repo root: pnpm deploy
#
# Nodes are defined below. Each entry is: user@host:~/target-dir:restart-cmd
# restart-cmd is run via SSH after the dist is copied.
# systemd Restart=always means killing the process is enough for a restart.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# ── Node registry ─────────────────────────────────────────────────────────────
# Format: "user@host:remote_dir:service_type"
# service_type: "system" = sudo systemctl, "user" = systemctl --user, "kill" = pkill only
NODES=(
  "lucius@192.168.1.170:loggie-dashboard:system"
  "harvey@192.168.1.158:loggie-dashboard:kill"
)

# Local node (this machine) — update and restart inline
LOCAL_DIR="$HOME/loggie-dashboard"
LOCAL_SERVICE="loggie-dashboard"

# ── Build ─────────────────────────────────────────────────────────────────────
echo "Building..."
cd "$REPO_DIR"
pnpm build
echo "Build complete."
echo ""

# ── Deploy to remote nodes ────────────────────────────────────────────────────
for entry in "${NODES[@]}"; do
  user_host="${entry%%:*}"
  rest="${entry#*:}"
  remote_dir="${rest%%:*}"
  service_type="${rest##*:}"

  echo "→ Deploying to $user_host (~/$remote_dir)..."

  scp -q -r "$REPO_DIR/dist/" "$user_host:~/$remote_dir/"

  case "$service_type" in
    system)
      ssh "$user_host" "sudo systemctl restart $LOCAL_SERVICE 2>/dev/null || pkill -f 'node dist/server/index.js' || true"
      ;;
    user)
      ssh "$user_host" "systemctl --user restart $LOCAL_SERVICE 2>/dev/null || pkill -f 'node dist/server/index.js' || true"
      ;;
    kill)
      ssh "$user_host" "pkill -f 'node dist/server/index.js' || true"
      ;;
  esac

  echo "  ✓ $user_host done"
done

# ── Update local node ─────────────────────────────────────────────────────────
if [ -d "$LOCAL_DIR" ]; then
  echo "→ Updating local node ($LOCAL_DIR)..."
  cp -r "$REPO_DIR/dist/" "$LOCAL_DIR/"
  systemctl --user restart "$LOCAL_SERVICE" 2>/dev/null \
    || sudo systemctl restart "$LOCAL_SERVICE" 2>/dev/null \
    || pkill -f 'node dist/server/index.js' || true
  echo "  ✓ local done"
fi

echo ""
echo "Deploy complete."
