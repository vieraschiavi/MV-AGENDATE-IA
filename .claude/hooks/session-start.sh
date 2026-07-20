#!/usr/bin/env bash
# SessionStart hook — MV Agendate IA (Node.js ESM + Express + node --test).
# Deja el entorno listo (deps instaladas) y verifica que el proyecto arranca/importa.
# Idempotente y tolerante a fallos de red: nunca aborta la sesión de Claude Code.
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

log() { printf '\033[0;36m[automator]\033[0m %s\n' "$1"; }
warn() { printf '\033[0;33m[automator]\033[0m %s\n' "$1"; }

# --- Node presente ---
if ! command -v node >/dev/null 2>&1; then
  warn "Node no está instalado — se requiere Node.js >= 20. Salteando setup."
  exit 0
fi
log "Node $(node --version)"

# --- Instalar dependencias (tolerante a red) ---
if [ -f package.json ]; then
  if [ -d node_modules ]; then
    log "node_modules ya presente — salteando instalación"
  elif [ -f package-lock.json ]; then
    log "Instalando deps con npm ci"
    npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund 2>/dev/null || warn "npm falló (posible red) — seguí sin deps"
  else
    log "Instalando deps con npm install"
    npm install --no-audit --no-fund 2>/dev/null || warn "npm falló (posible red) — seguí sin deps"
  fi
fi

# --- Verificación: el server principal debe parsear/importar sin ejecutar red ---
# node --check valida sintaxis sin correr el módulo (no abre puertos ni toca Redis).
if [ -f src/server.js ]; then
  if node --check src/server.js 2>/dev/null; then
    log "src/server.js parsea correctamente ✔"
  else
    warn "src/server.js no pasó node --check — revisar sintaxis"
  fi
fi
if [ -f api/index.js ]; then
  node --check api/index.js 2>/dev/null && log "api/index.js parsea correctamente ✔" || warn "api/index.js no pasó node --check"
fi

log "Entorno listo ✔"
