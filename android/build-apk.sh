#!/usr/bin/env bash
# © 2026 Martín Viera. Todos los derechos reservados.
# Compila y firma la APK de MV Agendate IA sin Gradle: aapt2 + javac + d8 + apksigner.
# Requisitos: Android SDK (build-tools 34 + platform 34) y JDK 11+.
#   ANDROID_SDK=/opt/android-sdk ./build-apk.sh
# Deja la APK firmada en ../public/descargas/MV-Agendate-IA.apk
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_SDK:-/opt/android-sdk}"
BT="$SDK/build-tools/${BT_VERSION:-35.0.0}"
JAR="$SDK/platforms/android-34/android.jar"
VC="${VERSION_CODE:-1}"
VN="${VERSION_NAME:-1.0.0}"
KEYSTORE="${ANDROID_KEYSTORE:-mv-release.keystore}"
# La contraseña del keystore NUNCA va en el código: se pasa por entorno.
#   ANDROID_STOREPASS='...' ./build-apk.sh
STOREPASS="${ANDROID_STOREPASS:-}"

[ -f "$JAR" ] || { echo "Falta el SDK de Android en $SDK"; exit 1; }
[ -n "$STOREPASS" ] || {
  echo "Falta ANDROID_STOREPASS (contraseña del keystore de firma)."
  echo "Usá:  ANDROID_STOREPASS='tu-clave' ./build-apk.sh"
  exit 1
}

rm -rf build && mkdir -p build/gen build/classes build/dex

# Keystore de firma (se crea una sola vez y SE CONSERVA: las actualizaciones
# de la APK deben firmarse con la misma clave para instalarse encima).
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -alias mv -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass "$STOREPASS" -keypass "$STOREPASS" \
    -dname "CN=MV Agendate IA, O=MV, C=UY"
fi

echo "[1/5] Recursos (aapt2)…"
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/base.apk -I "$JAR" \
  --manifest AndroidManifest.xml -R build/res.zip --auto-add-overlay \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VC" --version-name "$VN" \
  --java build/gen

echo "[2/5] Java (javac)…"
find build/gen src -name '*.java' > build/fuentes.txt
# -source/-target 8: es lo máximo que un JDK moderno acepta junto con
# -bootclasspath (android.jar); d8 desugarea los lambdas para Android.
javac -source 8 -target 8 -bootclasspath "$JAR" -classpath build/classes \
  -d build/classes @build/fuentes.txt 2> >(grep -v "deprecat\|obsolet\|warning" >&2 || true)

echo "[3/5] Dex (d8)…"
# d8 con .class sueltos de clases internas puede fallar (NPE interno): jar primero.
jar cf build/classes.jar -C build/classes .
"$BT/d8" --lib "$JAR" --release --output build/dex build/classes.jar

echo "[4/5] Empaquetado + alineado…"
cd build/dex && zip -q -u ../base.apk classes.dex && cd ../..
"$BT/zipalign" -f 4 build/base.apk build/alineada.apk

echo "[5/5] Firma (apksigner)…"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$STOREPASS" \
  --out build/MV-Agendate-IA.apk build/alineada.apk
"$BT/apksigner" verify build/MV-Agendate-IA.apk

mkdir -p ../public/descargas
cp build/MV-Agendate-IA.apk ../public/descargas/MV-Agendate-IA.apk
echo "APK lista: public/descargas/MV-Agendate-IA.apk ($(du -h build/MV-Agendate-IA.apk | cut -f1))"
