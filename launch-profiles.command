#!/bin/bash
set -u
cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  NODE_BIN=""
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node; do
    if [ -x "$candidate" ]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi

if [ -z "$NODE_BIN" ]; then
  echo "[Profiles] Node.js was not found."
  echo "Install Node.js 24 or newer, then try again."
  read -r -p "Press Enter to close..."
  exit 1
fi

export PATH="$(dirname "$NODE_BIN"):$PATH"

NODE_MAJOR="$("$NODE_BIN" -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "[Profiles] Node.js 24 or newer is required."
  "$NODE_BIN" --version
  read -r -p "Press Enter to close..."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[Profiles] npm was not found."
  echo "Install Node.js 24 or newer, then try again."
  read -r -p "Press Enter to close..."
  exit 1
fi

if [ ! -d "node_modules/express" ]; then
  echo "[Profiles] Installing dependencies for the first run..."
  if ! npm install --omit=dev --no-audit --no-fund; then
    echo "[Profiles] Dependency installation failed."
    echo "Check the network connection and run npm install manually."
    read -r -p "Press Enter to close..."
    exit 1
  fi
fi

if curl -fsS --max-time 1 http://localhost:3000 >/dev/null 2>&1; then
  open "http://localhost:3000"
  exit 0
fi

( sleep 1; open "http://localhost:3000" ) &
echo "[Profiles] Running. Close this Terminal window to stop the server."
exec "$NODE_BIN" server.js
