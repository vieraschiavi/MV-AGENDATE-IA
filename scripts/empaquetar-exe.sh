#!/usr/bin/env bash
# Genera el paquete de escritorio (Electron) para Windows →
# public/descargas/MV-Agendate-IA-Windows.zip. Adentro: "MV Agendate IA.exe"
# — doble clic, sin instalar Node.js aparte (Electron lo trae embebido) y
# sin ventana de terminal ni pestaña de navegador.
#
# Requiere que `npm install` ya haya corrido en la raíz (electron y
# electron-packager como devDependencies). Regeneralo con
# `npm run empaquetar-exe` cuando cambie el código.
set -e
cd "$(dirname "$0")/.."
OUT="public/descargas"
NOMBRE_ZIP="MV-Agendate-IA-Windows.zip"
NOMBRE_APP="MV Agendate IA"
mkdir -p "$OUT"

STAGE="$(mktemp -d)"
APP="$STAGE/app"
mkdir -p "$APP"

# Código (igual que empaquetar-pc.sh: sin video promo ni la carpeta de descargas).
cp -r src api electron "$APP"/
mkdir -p "$APP/public"
for item in public/*; do
  base="$(basename "$item")"
  [ "$base" = "video" ] && continue
  [ "$base" = "descargas" ] && continue
  cp -r "$item" "$APP/public/"
done

# package.json de empaquetado: mismo que el real, pero apuntando a Electron
# como entrypoint (el real sigue apuntando a src/server.js para Vercel/PC).
ELECTRON_VERSION="$(node -e "console.log(require('./node_modules/electron/package.json').version)")"
node -e "
  const pkg = require('./package.json');
  pkg.main = 'electron/main.cjs';
  pkg.author = 'MV Agendate IA';
  delete pkg.scripts;
  pkg.devDependencies = { electron: '$ELECTRON_VERSION' };
  require('fs').writeFileSync('$APP/package.json', JSON.stringify(pkg, null, 2));
"

# node_modules ya instalados. electron-packager necesita poder resolver el
# módulo "electron" desde acá para validar la versión (aunque el binario que
# termina empaquetado es el de la plataforma destino, descargado aparte); lo
# excluye solo del paquete final por su propia lista de ignorados.
mkdir -p "$APP/node_modules"
for dir in node_modules/*; do
  base="$(basename "$dir")"
  [ "$base" = "electron-packager" ] && continue
  cp -r "$dir" "$APP/node_modules/"
done
[ -f node_modules/.package-lock.json ] && cp node_modules/.package-lock.json "$APP/node_modules/" || true

echo "Empaquetando para Windows x64 (baja el binario de Electron la primera vez)..."
# Fijar el ícono/metadata del .exe en Windows requiere rcedit, que a su vez
# requiere Wine para correr en Linux (instalado aparte: apt install wine64).
ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}" \
  npx --yes electron-packager "$APP" "$NOMBRE_APP" \
  --platform=win32 --arch=x64 \
  --electron-version="$ELECTRON_VERSION" \
  --out="$STAGE/dist" \
  --icon="build/logo-mv.ico" \
  --app-version="$(node -e "console.log(require('./package.json').version)")" \
  --overwrite --quiet

( cd "$STAGE/dist" && zip -rq "$NOMBRE_ZIP" "$NOMBRE_APP-win32-x64" )
mv "$STAGE/dist/$NOMBRE_ZIP" "$OUT/$NOMBRE_ZIP"
rm -rf "$STAGE"
echo "Generado: $OUT/$NOMBRE_ZIP ($(du -h "$OUT/$NOMBRE_ZIP" | cut -f1))"
