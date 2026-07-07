#!/usr/bin/env bash
# Empaqueta el producto en carpetas separadas por versión:
#   dist/MV-PC/   → programa de escritorio/servidor (Node) para el profesional
#   dist/MV-APK/  → app Android (APK + guía + fuentes)
# Genera además los .zip listos para entregar/vender.
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
cd "$AQUI"
DIST="$AQUI/dist"
rm -rf "$DIST"
mkdir -p "$DIST/MV-PC" "$DIST/MV-APK"

echo "[1/3] Paquete PC (programa/servidor)"
# Todo lo necesario para correr el programa, SIN node_modules, datos ni secretos.
for item in src public package.json package-lock.json INICIAR.bat INSTALAR.bat instalar.sh .env.example README.md DONDE-VA-LA-API-KEY.md docs; do
  [ -e "$item" ] && cp -r "$item" "$DIST/MV-PC/"
done
# No incluir la app móvil completa ni datos privados en el paquete PC
rm -rf "$DIST/MV-PC/data" "$DIST/MV-PC/src/clave-embebida.b64" 2>/dev/null || true
cat > "$DIST/MV-PC/LEEME.txt" <<'TXT'
MV Agendate IA — Versión PC (programa/servidor)
1) Instalá Node.js LTS (https://nodejs.org)
2) Doble clic en INSTALAR.bat (Windows) o ./instalar.sh (Linux/Mac)
3) Doble clic en INICIAR.bat (o npm start). La primera vez te pide tu API key de Claude.
4) Para vender con tu key embebida: npm run embeber-clave
Abrí http://localhost:3000  (panel del día, dashboards, agenda, clientes)
TXT

echo "[2/3] Paquete APK (app Android)"
cp -r movil/MV-AgendateIA.apk "$DIST/MV-APK/" 2>/dev/null || echo "  (APK no compilado; corré movil/construir-apk-release.sh)"
cp movil/COMO-INSTALAR.md "$DIST/MV-APK/" 2>/dev/null || true
# Fuentes de la app para reconstruir con la marca del cliente
mkdir -p "$DIST/MV-APK/fuentes"
for item in index.html manifest.json sw.js icon.svg icon-512.png icon-foreground.png icon-background.png construir-apk-release.sh construir-apk-gradle.sh; do
  [ -e "movil/$item" ] && cp "movil/$item" "$DIST/MV-APK/fuentes/"
done
cat > "$DIST/MV-APK/LEEME.txt" <<'TXT'
MV Agendate IA — Versión Android (APK)
- MV-AgendateIA.apk: instalable en Android 5.1+ (ver COMO-INSTALAR.md).
- La app se conecta al servidor del programa PC (⚙️ dirección del servidor).
- fuentes/: para reconstruir el APK con la marca del cliente (construir-apk-release.sh).
TXT

echo "[3/3] Comprimir"
cd "$DIST"
zip -qr MV-PC.zip MV-PC && echo "  ✓ dist/MV-PC.zip"
zip -qr MV-APK.zip MV-APK && echo "  ✓ dist/MV-APK.zip"
echo
echo "✅ Paquetes listos en: $DIST"
ls -la "$DIST"
