#!/usr/bin/env bash
# Genera el paquete PORTABLE (.zip con lanzador .bat, sin instalador) para la
# variante que se le pida. Es la alternativa al instalador .exe, pensada para
# las empresas donde no se pueden abrir ejecutables.
#
#   scripts/empaquetar-pc.sh            → CLIENTE (prueba de 7 días)
#   scripts/empaquetar-pc.sh --demo     → DEMO    (prueba de 3 días)
#   scripts/empaquetar-pc.sh --owner    → DUEÑO   (sin límite de prueba)
#
# El paquete sale AUTOCONTENIDO: lleva node_modules adentro, así el cliente no
# necesita internet ni npm en la primera corrida (solo Node.js instalado).
# El código va OFUSCADO (igual que el .exe) y con los días de prueba FIJADOS
# adentro por scripts/ofuscar.js — sin eso, el paquete corre src/ con node y
# alcanzaría un DIAS_PRUEBA=0 en el entorno para usarlo gratis para siempre.
set -euo pipefail
cd "$(dirname "$0")/.."

VARIANTE=""
NOMBRE="MV-Agendate-IA-PC.zip"
ETIQUETA="version que se vende"
DESTINOS=("INSTALADOR/CLIENTE" "public/descargas")
case "${1:-}" in
  --demo)
    VARIANTE="--demo"; NOMBRE="MV-Agendate-IA-PC-Demo.zip"
    ETIQUETA="DEMO"; DESTINOS=("INSTALADOR/CLIENTE") ;;
  --owner)
    VARIANTE="--owner"; NOMBRE="MV-Agendate-IA-PC-Dueno.zip"
    ETIQUETA="version del dueno"
    # NUNCA en public/: esa carpeta la sirve Vercel y esta variante no tiene
    # límite de prueba. Vive solo en el repo privado, igual que su .exe.
    DESTINOS=("INSTALADOR/OWNER") ;;
  "") ;;
  *) echo "✘ Opción desconocida: $1 (usá --demo, --owner o nada)"; exit 1 ;;
esac

# Días de prueba de esta variante, para el texto del LEEME. La fuente de verdad
# es scripts/variante-instalador.js — la misma que fija el número adentro del
# código, así el texto nunca promete algo distinto de lo que hace el programa.
ES_OWNER=false; ES_DEMO=false
[ "$VARIANTE" = "--owner" ] && ES_OWNER=true
[ "$VARIANTE" = "--demo" ]  && ES_DEMO=true
DIAS=$(node -e "
  import('./scripts/variante-instalador.js').then(m =>
    console.log(m.diasDeVariante({ owner: $ES_OWNER, demo: $ES_DEMO })));
")

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
APP="$STAGE/MV-Agendate-IA"
mkdir -p "$APP"

echo "→ Ofuscando y fijando los días de prueba de la variante..."
node scripts/ofuscar.js ${VARIANTE:-}

# Código: la copia OFUSCADA, no src/ en limpio. api/ no va: es solo el
# envoltorio serverless de Vercel y no lo usa el lanzador.
cp -r dist-protegido/src "$APP"/
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

# Librerías adentro del paquete: que ande sin internet ni npm.
echo "→ Instalando dependencias de producción dentro del paquete..."
( cd "$APP" && npm install --omit=dev --no-audit --no-fund --silent )

# Lanzadores + ícono + LEEME de la variante (lo que ve el usuario).
cp scripts/pc/Iniciar-MV-Agendate.bat "$APP"/
cp scripts/pc/Iniciar-MV-Agendate.command "$APP"/
cp scripts/pc/Crear-acceso-directo.bat "$APP"/
cp scripts/pc/Quitar-accesos-directos.bat "$APP"/
cp build/logo-mv.ico "$APP"/
chmod +x "$APP/Iniciar-MV-Agendate.command"

if [ "${DIAS:-0}" -gt 0 ] 2>/dev/null; then
  TEXTO_PRUEBA="PRUEBA GRATIS
-------------
  Funciona completo durante $DIAS dias desde la primera vez que lo
  abris. Despues se bloquea hasta que actives tu licencia: la comprás
  por MercadoPago desde el propio programa y te llega el codigo por
  email. Se activa en Configuracion."
else
  TEXTO_PRUEBA="SIN LIMITE DE PRUEBA
--------------------
  Esta copia no tiene limite de dias ni pide licencia."
fi
# Con node y no con python3/sed: node es lo único que este repo ya exige en
# todas partes (y en los runners de Windows python3 puede no existir).
LEEME_DESTINO="$APP/LEEME.txt" LEEME_ETIQUETA="$ETIQUETA" LEEME_PRUEBA="$TEXTO_PRUEBA" node -e "
  const fs = require('node:fs');
  const plantilla = fs.readFileSync('scripts/pc/LEEME.txt', 'utf8');
  fs.writeFileSync(process.env.LEEME_DESTINO, plantilla
    .replaceAll('{{ETIQUETA}}', process.env.LEEME_ETIQUETA)
    .replaceAll('{{PRUEBA}}', process.env.LEEME_PRUEBA), 'utf8');
"

# Comprimir con lo que haya: `zip` en Linux/Mac, y en los runners de Windows
# (Git Bash no trae zip) PowerShell o 7z, que sí están.
comprimir() {
  local dir="$1" salida="$2"
  if command -v zip >/dev/null 2>&1; then
    ( cd "$dir" && zip -rq "$salida" MV-Agendate-IA )
  elif command -v powershell >/dev/null 2>&1; then
    powershell -NoProfile -Command \
      "Compress-Archive -Path '$(cd "$dir" && pwd -W 2>/dev/null || echo "$dir")\\MV-Agendate-IA' -DestinationPath '$(cd "$dir" && pwd -W 2>/dev/null || echo "$dir")\\$salida' -Force"
  elif command -v 7z >/dev/null 2>&1; then
    ( cd "$dir" && 7z a -tzip -bso0 -bsp0 "$salida" MV-Agendate-IA )
  else
    echo "✘ No encontré con qué comprimir (zip, powershell ni 7z)."; exit 1
  fi
}
comprimir "$STAGE" "$NOMBRE"

for destino in "${DESTINOS[@]}"; do
  mkdir -p "$destino"
  cp "$STAGE/$NOMBRE" "$destino/$NOMBRE"
  echo "✔ $destino/$NOMBRE ($(du -h "$destino/$NOMBRE" | cut -f1)) — $ETIQUETA, prueba de ${DIAS:-?} días"
done
