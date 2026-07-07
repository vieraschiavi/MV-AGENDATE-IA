#!/usr/bin/env bash
# Compila MV Agendate IA como APK RELEASE firmado (no debuggable), listo para
# distribuir a los teléfonos. Firma v1+v2+v3 con un keystore propio del
# negocio. Requiere JDK 17, Android SDK (platform 34 + build-tools 34) y Node.
#
# La primera vez crea movil/mv-release.keystore. GUARDALO: toda actualización
# futura debe firmarse con el mismo keystore para instalar encima de la anterior.
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

# Gradle (usa el espejo de Huawei si services.gradle.org está bloqueado)
GRADLE_URL="${GRADLE_URL:-https://services.gradle.org/distributions/gradle-8.7-bin.zip}"
if [ ! -x /opt/gradle-8.7/bin/gradle ]; then
  echo "[1/6] Descargando Gradle 8.7..."
  curl -fsSL -o /tmp/gradle.zip "$GRADLE_URL" || \
    curl -fsSL -o /tmp/gradle.zip "https://repo.huaweicloud.com/gradle/gradle-8.7-bin.zip"
  unzip -q -o /tmp/gradle.zip -d /opt
fi
export PATH=/opt/gradle-8.7/bin:$PATH

echo "[2/6] Assets web → www/"
cd "$AQUI"
rm -rf www android
mkdir -p www && cp index.html manifest.json icon.svg sw.js www/

echo "[3/6] Proyecto Capacitor"
[ -f package.json ] || echo '{ "name": "mv-agendate-ia", "version": "1.0.0", "private": true }' > package.json
npm i @capacitor/core@6 @capacitor/cli@6 @capacitor/android@6
cat > capacitor.config.json <<'JSON'
{ "appId": "com.mv.agendate", "appName": "MV Agendate IA", "webDir": "www", "server": { "androidScheme": "https" } }
JSON
npx cap add android
npx cap sync android

# Ícono de la app = logo MV como ÍCONO ADAPTATIVO (fondo navy a sangre completa +
# letras MV centradas), que se ve a tamaño correcto en todos los launchers.
if [ -f "$AQUI/icon-foreground.png" ] && [ -f "$AQUI/icon-background.png" ]; then
  echo "    Aplicando logo MV como ícono adaptativo"
  for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
    DIR="android/app/src/main/res/mipmap-$d"
    mkdir -p "$DIR"
    cp "$AQUI/icon-foreground.png" "$DIR/ic_launcher_foreground.png"
    cp "$AQUI/icon-background.png" "$DIR/ic_launcher_background.png"
    # Ícono legacy (pre-Android 8): el logo completo tal cual
    cp "$AQUI/icon-512.png" "$DIR/ic_launcher.png"
    cp "$AQUI/icon-512.png" "$DIR/ic_launcher_round.png"
  done
  # XML adaptativo: fondo (gradiente navy) + primer plano (MV)
  ADP="android/app/src/main/res/mipmap-anydpi-v26"; mkdir -p "$ADP"
  for x in ic_launcher.xml ic_launcher_round.xml; do
    cat > "$ADP/$x" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
XML
  done
fi

WP=android/gradle/wrapper/gradle-wrapper.properties
sed -i 's#distributionUrl=.*#distributionUrl=https\\://repo.huaweicloud.com/gradle/gradle-8.7-bin.zip#' "$WP" || true

echo "[4/6] Compilando APK release (sin firmar)"
cd android
./gradlew --no-daemon assembleRelease
UNS=$(find . -name 'app-release-unsigned.apk' | head -1)

echo "[5/6] Keystore de release"
KS="$AQUI/mv-release.keystore"
STOREPASS="${MV_KEYSTORE_PASS:-mvagente2026}"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -v -keystore "$KS" -alias mv -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$STOREPASS" -keypass "$STOREPASS" \
    -dname "CN=MV Agendate IA, O=MV Agente, L=Montevideo, C=UY"
  echo "  ⚠️  Keystore creado en $KS — GUARDALO, lo necesitás para actualizar la app."
fi

echo "[6/6] Alinear + firmar v1+v2+v3"
ZA=$(ls "$ANDROID_HOME"/build-tools/*/zipalign | sort | tail -1)
AS=$(ls "$ANDROID_HOME"/build-tools/*/apksigner | sort | tail -1)
"$ZA" -f 4 "$UNS" /tmp/mv-aligned.apk
"$AS" sign --ks "$KS" --ks-key-alias mv --ks-pass "pass:$STOREPASS" --key-pass "pass:$STOREPASS" \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$AQUI/MV-AgendateIA.apk" /tmp/mv-aligned.apk

echo
"$AS" verify -v --min-sdk-version 22 "$AQUI/MV-AgendateIA.apk" | grep -iE "verifies|scheme"
echo "✅ APK release firmado: $AQUI/MV-AgendateIA.apk"
