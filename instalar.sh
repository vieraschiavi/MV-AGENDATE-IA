#!/usr/bin/env bash
# © 2026 Martín Viera. Todos los derechos reservados.
# Instalador para Linux/macOS (servidores VPS incluidos)
set -e
echo "============================================"
echo " MV AGENDATE IA — INSTALADOR"
echo "============================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[X] Falta Node.js (>=20). Instalalo desde https://nodejs.org o con tu gestor de paquetes."
  exit 1
fi
echo "[OK] Node.js $(node -v) detectado."

echo "[..] Instalando dependencias..."
npm install --no-audit --no-fund

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[OK] .env creado — editalo para cargar tus claves (sin claves corre en MODO DEMO)."
fi

echo
echo "[OK] Instalación completa. Arrancá con:  npm start"
echo "     Producción con reinicio automático:  npx pm2 start src/server.js --name mv-agendate-ia"
