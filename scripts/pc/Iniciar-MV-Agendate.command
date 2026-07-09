#!/usr/bin/env bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Necesitas Node.js (gratis). Abrí https://nodejs.org/es/download, instalá la versión LTS y volvé a abrir esto."
  (open https://nodejs.org/es/download 2>/dev/null || xdg-open https://nodejs.org/es/download 2>/dev/null) || true
  read -p "Enter para salir..."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Preparando por primera vez, esto puede tardar un par de minutos..."
  npm install --omit=dev
fi
echo "Abriendo MV Agendate IA en tu navegador..."
( sleep 2 && (open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null) ) &
node src/server.js
