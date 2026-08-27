#!/usr/bin/env bash
# © 2026 Martín Viera. Todos los derechos reservados.
#
# Regenera los posters del video promocional, uno por idioma.
#
# POR QUÉ EXISTE ESTE SCRIPT: el poster es lo único que se ve del video hasta
# que la persona toca play — y lo único que ve quien nunca lo toca. Durante un
# tiempo hubo un solo poster.jpg, en español, servido también en /en/ y /pt/:
# un visitante en inglés veía una captura del cotizador en español, con precios
# en pesos, antes de siquiera darle play al video en inglés que sí existía.
#
# La solución no fue diseñar tres imágenes: el poster correcto ya estaba
# adentro de cada video. Los tres .mp4 son el MISMO montaje con distinta
# narración y distintos textos en pantalla (misma duración exacta, 1:02.55),
# así que el mismo segundo muestra la misma escena en los tres idiomas — con
# su texto, y hasta con la moneda de cada mercado ($ / US$ / R$).
#
# SEGUNDO: 20s, la pantalla del cotizador ("Cotiza con IA según tu mercado").
# Si se re-edita el video y cambia el montaje, ajustar SEGUNDO acá y volver a
# correr esto; si no, el poster queda mostrando una escena que ya no existe.
#
# Uso:
#   scripts/generar-posters.sh            # usa el ffmpeg del PATH
#   FFMPEG=/ruta/a/ffmpeg scripts/generar-posters.sh
set -euo pipefail

cd "$(dirname "$0")/.."

FFMPEG="${FFMPEG:-ffmpeg}"
SEGUNDO=20
CALIDAD=3   # -q:v de mjpeg: da ~100 KB a 1080x1920, igual que el poster original

if ! command -v "$FFMPEG" >/dev/null 2>&1 && [ ! -x "$FFMPEG" ]; then
  echo "Falta ffmpeg. Instalalo (apt install ffmpeg / brew install ffmpeg)" >&2
  echo "o pasale la ruta: FFMPEG=/ruta/a/ffmpeg $0" >&2
  exit 1
fi

# es = el archivo sin sufijo y su poster sin sufijo (son los originales del
# repo); en/pt llevan sufijo en los dos lados.
for idioma in es en pt; do
  if [ "$idioma" = "es" ]; then
    video="public/video/mv-agendate-ia.mp4"
    salida="public/video/poster.jpg"
  else
    video="public/video/mv-agendate-ia-${idioma}.mp4"
    salida="public/video/poster-${idioma}.jpg"
  fi

  if [ ! -f "$video" ]; then
    echo "No está $video — se saltea $idioma" >&2
    continue
  fi

  "$FFMPEG" -loglevel error -ss "$SEGUNDO" -i "$video" \
    -frames:v 1 -q:v "$CALIDAD" "$salida" -y
  echo "  $salida  ($(wc -c < "$salida") bytes)"
done

echo "Listo. Revisá las tres imágenes antes de commitear: el segundo elegido"
echo "tiene que mostrar la misma escena en los tres idiomas."
