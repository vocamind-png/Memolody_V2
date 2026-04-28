#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  Memolody V2 + Vocalido — Local Development Launcher
#  Starts both the Python SVS server and the Vite dev server.
#
#  Usage: bash start-local.sh
#  Stop:  Ctrl+C  (kills both processes)
# ═══════════════════════════════════════════════════════════════════

set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/vocalido_server"

# ── Colors ────────────────────────────────────────────────────────
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Memolody V2 + Vocalido — Local Dev Launcher       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Check ports ───────────────────────────────────────────────────
check_port() {
  lsof -i ":$1" -t &>/dev/null
}

if check_port 5001; then
  echo -e "${YELLOW}⚠️  Port 5001 already in use. Killing old process...${NC}"
  lsof -ti :5001 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

if check_port 3000; then
  echo -e "${YELLOW}⚠️  Port 3000 already in use. Killing old process...${NC}"
  lsof -ti :3000 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# ── Python .venv check ────────────────────────────────────────────
VENV="$SERVER_DIR/.venv"
if [ ! -d "$VENV" ]; then
  echo -e "${YELLOW}⚠️  .venv not found in vocalido_server.${NC}"
  echo -e "   Run: ${GREEN}cd vocalido_server && bash setup.sh${NC} first."
  exit 1
fi

# ── Cleanup on exit ───────────────────────────────────────────────
cleanup() {
  echo ""
  echo -e "${YELLOW}🛑 Shutting down all processes...${NC}"
  kill $SVS_PID $VITE_PID 2>/dev/null || true
  wait $SVS_PID $VITE_PID 2>/dev/null || true
  echo -e "${GREEN}✅ All processes stopped.${NC}"
}
trap cleanup EXIT INT TERM

# ── 1. Start Vocalido SVS server (Python FastAPI) on port 5001 ───
echo -e "${GREEN}▶ Starting Vocalido SVS server on port 5001...${NC}"
cd "$SERVER_DIR"
source "$VENV/bin/activate"
python -m uvicorn main:app --host 0.0.0.0 --port 5001 --reload \
  --log-level info \
  2>&1 | sed "s/^/  ${CYAN}[SVS]${NC} /" &
SVS_PID=$!
echo -e "  PID: $SVS_PID"

# Wait for SVS server to be ready
echo -n "  Waiting for SVS server"
for i in {1..20}; do
  sleep 1
  if curl -s http://localhost:5001/health &>/dev/null; then
    echo -e " ${GREEN}✅ Ready!${NC}"
    break
  fi
  echo -n "."
  if [ $i -eq 20 ]; then
    echo -e " ${YELLOW}⚠️  Server slow to start, continuing anyway...${NC}"
  fi
done

# ── 2. Start Vite dev server (React frontend) on port 3000 ───────
echo ""
echo -e "${GREEN}▶ Starting Memolody V2 frontend on port 3000...${NC}"
cd "$ROOT_DIR"
npm run dev 2>&1 | sed "s/^/  ${CYAN}[VITE]${NC} /" &
VITE_PID=$!
echo -e "  PID: $VITE_PID"

# ── 3. Summary ────────────────────────────────────────────────────
sleep 2
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   ✅ All services running!                           ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║   🌐 Frontend:   http://localhost:3000               ║${NC}"
echo -e "${CYAN}║   🎤 SVS Server: http://localhost:5001/health        ║${NC}"
echo -e "${CYAN}║   📡 Vocalido:   → localhost:5001 (local mode)       ║${NC}"
echo -e "${CYAN}║   🎵 Studio:     → localhost:5001/studio/*           ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║   Press Ctrl+C to stop all services.                ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Keep script alive until Ctrl+C
wait $SVS_PID $VITE_PID
