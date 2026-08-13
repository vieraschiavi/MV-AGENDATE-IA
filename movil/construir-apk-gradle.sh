#!/usr/bin/env bash
# © 2026 Martín Viera. Todos los derechos reservados.
# Compila MV Agendate IA como APK ESTÁNDAR con Capacitor + Gradle.
# Es el método recomendado (produce un APK idéntico en estructura a cualquier
# app de Play Store; instala en todos los teléfonos). Requiere JDK 17,
# Android SDK (platform 34 + build-tools 34) y Node.
#
# Nota: si services.gradle.org está bloqueado por tu red, este script usa el
# espejo de Huawei para bajar Gradle. Cambialo si tenés otro.
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

GRADLE_URL="${GRADLE_URL:-https://services.gradle.org/distributions/gradle-8.7-bin.zip}"
if [ ! -x /opt/gradle-8.7/bin/gradle ]; then
  echo "[1/5] Descargando Gradle 8.7..."
  curl -fsSL -o /tmp/gradle.zip "$GRADLE_URL" || \
    curl -fsSL -o /tmp/gradle.zip "https://repo.huaweicloud.com/gradle/gradle-8.7-bin.zip"
  unzip -q -o /tmp/gradle.zip -d /opt
fi
export PATH=/opt/gradle-8.7/bin:$PATH

echo "[2/5] Assets web → www/"
cd "$AQUI"
rm -rf www android
mkdir -p www && cp index.html manifest.json icon.svg sw.js www/

echo "[3/5] Proyecto Capacitor"
[ -f package.json ] || echo '{ "name": "mv-agendate-ia", "version": "1.0.0", "private": true }' > package.json
npm i @capacitor/core@6 @capacitor/cli@6 @capacitor/android@6
cat > capacitor.config.json <<'JSON'
{ "appId": "com.mv.agendate", "appName": "MV Agendate IA", "webDir": "www", "server": { "androidScheme": "https" } }
JSON
npx cap add android
npx cap sync android

echo "[4/5] Apuntar wrapper de Gradle al espejo (si aplica)"
WP=android/gradle/wrapper/gradle-wrapper.properties
sed -i 's#distributionUrl=.*#distributionUrl=https\\://repo.huaweicloud.com/gradle/gradle-8.7-bin.zip#' "$WP" || true

echo "[5/5] Compilando APK debug"
cd android
./gradlew --no-daemon assembleDebug
APK=$(find . -name '*-debug.apk' | head -1)
cp "$APK" "$AQUI/MV-AgendateIA.apk"
echo
echo "✅ APK estándar listo: $AQUI/MV-AgendateIA.apk"
echo "   Para release firmado con tu clave: ./gradlew assembleRelease + apksigner"
