#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# NexaMap local runner — builds (only if the code changed since the last build),
# starts the production server, and opens it in your browser. Shared by both
# NexaMap.command (Terminal) and NexaMap.app (Dock).
# ─────────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1

# GUI launchers (the .app) run with a bare PATH, so add the locations where
# node / npm / pnpm actually live on this Mac.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.npm-global/bin:$PATH"

# Port 5000 collides with macOS AirPlay Receiver, so use a safe fixed port.
export PORT="${PORT:-8788}"
URL="http://localhost:$PORT/"

# Prefer pnpm (the repo's package manager); fall back to npm.
if command -v pnpm >/dev/null 2>&1; then PM=pnpm; else PM=npm; fi

echo "🗺️  NexaMap"
echo "    $(pwd)"
echo ""

# Install dependencies on first run.
if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies (first run, ~1–2 min)…"
  "$PM" install || { echo "❌ install failed"; read -r -p "Press Return to close…"; exit 1; }
fi

# Rebuild only when something under client/server/config is newer than the build.
if [ ! -f dist/spa/index.html ] || \
   find client server shared index.html package.json vite.config.ts vite.config.server.ts \
        -type f -newer dist/spa/index.html 2>/dev/null | grep -q .; then
  echo "🔨 Building (only runs when code changed; ~30–60s)…"
  "$PM" run build || { echo "❌ build failed"; read -r -p "Press Return to close…"; exit 1; }
else
  echo "✓ Build is up to date — skipping."
fi

# Open the browser as soon as the server answers.
( for _ in $(seq 1 120); do
    if curl -sf "$URL" >/dev/null 2>&1; then open "$URL"; break; fi
    sleep 0.5
  done ) &

echo ""
echo "🚀 Serving at $URL"
echo "   (Close this window or press Ctrl-C to stop NexaMap.)"
echo ""

# Replace this shell with the server so Ctrl-C / closing the window stops it.
exec "$PM" start
