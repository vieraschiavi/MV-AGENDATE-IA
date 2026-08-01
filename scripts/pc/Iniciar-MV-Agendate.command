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
  # Sin este chequeo, si la preparación fallaba (sin internet, disco lleno) el
  # script seguía igual y arrancaba el programa, que moría con un
  # "Cannot find module" que no le dice nada a nadie.
  if ! npm install --omit=dev --no-audit --no-fund; then
    echo
    echo "[X] No se pudo preparar el programa."
    echo "    Causas más comunes: sin internet (solo hace falta la primera vez),"
    echo "    sin espacio en disco (necesitás unos 500 MB libres) o permisos."
    read -p "Enter para salir..."
    exit 1
  fi
fi
echo "Abriendo MV Agendate IA en tu navegador..."
# El navegador lo abre el PROGRAMA, no este script: si el puerto 3000 está
# ocupado por otra app, el programa usa el siguiente libre y sólo él sabe cuál
# quedó. Antes esto abría localhost:3000 a ciegas tras un `sleep 2`, y podía
# terminar mostrando la OTRA aplicación.
export MV_ABRIR_NAVEGADOR=1
node src/server.js
