#!/usr/bin/env bash
# Genera el paquete PC descargable (versión de prueba, 7 días) →
# public/descargas/MV-Agendate-IA-PC.zip. Es un snapshot: regeneralo cuando
# cambie el código con  npm run empaquetar-pc.
set -e
cd "$(dirname "$0")/.."
OUT="public/descargas"
NOMBRE="MV-Agendate-IA-PC.zip"
mkdir -p "$OUT"
rm -f "$OUT/$NOMBRE"

STAGE="$(mktemp -d)"
APP="$STAGE/MV-Agendate-IA"
mkdir -p "$APP"

# App runnable (sin node_modules: el lanzador corre npm install la 1ª vez).
cp -r src api "$APP"/
cp package.json "$APP"/
[ -f package-lock.json ] && cp package-lock.json "$APP"/ || true

# public SIN el video promo (18 MB) ni la propia carpeta de descargas.
mkdir -p "$APP/public"
for item in public/*; do
  base="$(basename "$item")"
  [ "$base" = "video" ] && continue
  [ "$base" = "descargas" ] && continue
  cp -r "$item" "$APP/public/"
done

# Lanzadores + LEEME en la raíz del paquete (lo que ve el usuario).
cp scripts/pc/Iniciar-MV-Agendate.bat "$APP"/
cp scripts/pc/Iniciar-MV-Agendate.command "$APP"/
cp scripts/pc/LEEME.txt "$APP"/
chmod +x "$APP/Iniciar-MV-Agendate.command"

( cd "$STAGE" && zip -rq "$NOMBRE" MV-Agendate-IA )
mv "$STAGE/$NOMBRE" "$OUT/$NOMBRE"
rm -rf "$STAGE"
echo "Generado: $OUT/$NOMBRE ($(du -h "$OUT/$NOMBRE" | cut -f1))"
