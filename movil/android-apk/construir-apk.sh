#!/usr/bin/env bash
# Compila el APK de MV Agendate IA SIN Gradle ni Android Studio:
# javac + d8 + aapt2 + zipalign + apksigner (Android build-tools).
# Requisitos: JDK 17+, Android SDK con build-tools 34 y platform android-34.
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_HOME:-/opt/android-sdk}"
BT="$SDK/build-tools/34.0.0"
PLAT="$SDK/platforms/android-34/android.jar"
OUT="$AQUI/build"
rm -rf "$OUT" && mkdir -p "$OUT/classes" "$OUT/dex" "$OUT/res-compiled" "$OUT/assets/www"

echo "[1/6] Assets web (la app MV)"
cp "$AQUI/../index.html" "$AQUI/../icon.svg" "$OUT/assets/www/"

echo "[2/6] Ícono PNG (rasterizado con Chromium si no existe)"
if [ ! -f "$AQUI/res/mipmap/ic_launcher.png" ]; then
  mkdir -p "$AQUI/res/mipmap"
  CHROME="${CHROME:-/opt/pw-browsers/chromium}"
  "$CHROME" --headless --no-sandbox --screenshot="$AQUI/res/mipmap/ic_launcher.png" \
    --window-size=192,192 --default-background-color=00000000 "file://$AQUI/../icon.svg" 2>/dev/null
fi

echo "[3/6] Recursos + manifiesto (aapt2)"
"$BT/aapt2" compile --dir "$AQUI/res" -o "$OUT/res-compiled/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$PLAT" \
  --manifest "$AQUI/AndroidManifest.xml" \
  --min-sdk-version 24 --target-sdk-version 34 \
  -A "$OUT/assets" "$OUT/res-compiled/res.zip"

echo "[4/6] Java → DEX (javac + d8)"
javac -g:none -source 8 -target 8 -nowarn -classpath "$PLAT" -d "$OUT/classes" \
  "$AQUI/java/com/mv/agendate/"*.java
"$BT/d8" --release --lib "$PLAT" --output "$OUT/dex" "$OUT/classes/com/mv/agendate/"*.class
(cd "$OUT/dex" && zip -q -X "$OUT/base.apk" classes.dex)

echo "[5/6] Alinear y firmar (keystore debug autogenerado)"
"$BT/zipalign" -f 4 "$OUT/base.apk" "$OUT/aligned.apk"
KS="$AQUI/debug.keystore"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android \
  -alias mvdebug -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=MV Agendate IA, O=MV, C=UY" 2>/dev/null
# Firmar con los TRES esquemas (v1 JAR + v2 + v3). El v1 es clave: sin él,
# muchos "instaladores de APK" de terceros y exploradores de archivos no
# reconocen el paquete (min-sdk 24 lo omite por defecto — lo forzamos).
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --min-sdk-version 24 \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$OUT/MV-AgendateIA.apk" "$OUT/aligned.apk"

echo "[6/6] Verificación"
"$BT/apksigner" verify -v "$OUT/MV-AgendateIA.apk" | grep -iE 'scheme|verified'
"$BT/aapt2" dump badging "$OUT/MV-AgendateIA.apk" | head -3
echo
echo "✅ APK listo: $OUT/MV-AgendateIA.apk"
echo "   Instalar: pasar al teléfono y abrir (habilitar 'orígenes desconocidos'),"
echo "   o con cable: adb install MV-AgendateIA.apk"
