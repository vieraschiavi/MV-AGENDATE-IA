# APK Android de MV Agendate IA

App Android **nativa** (contenedor WebView) que abre el workspace de MV:
por defecto la nube (`https://mv-agendate-ia.vercel.app/app/`), y si el
profesional usa la versión descargable en su PC, puede apuntarla a su
servidor local (mantener presionado el ícono de la app → **Configurar
servidor** → `http://IP-de-tu-PC:3000`).

## Qué hace la parte nativa

- Descargas de exportaciones (Excel/CSV/PDF) a la carpeta **Descargas** con
  notificación (pide el permiso solo en Android 9 o menor).
- Subida de archivos (logo del negocio) con el selector nativo.
- WhatsApp/teléfono/mail abren en su app; MercadoPago paga dentro de la app.
- Botón atrás navega el historial; rotación sin recargar la página.
- Página de error con **Reintentar** / **Cambiar servidor** si no hay conexión.
- Splash con el logo, íconos adaptativos, textos en español y portugués.

## Compilar

Sin Gradle: `aapt2 + javac + d8 + zipalign + apksigner` directos.

```bash
ANDROID_SDK=/ruta/al/sdk ./build-apk.sh          # deja la APK firmada en public/descargas/
VERSION_CODE=2 VERSION_NAME=1.1.0 ./build-apk.sh # para publicar una actualización
```

Requiere: JDK 11+, Android SDK con `platforms;android-34` y
`build-tools;35.0.0` (el d8 de build-tools 34 tiene un bug con clases
compiladas por JDK 21).

## Firma (importante)

El keystore **NO se versiona** y la contraseña **NO va en el código**: son la
identidad de la app. Quien tenga los dos puede firmar una APK haciéndose pasar
por MV Agendate IA. Se pasan por entorno:

```
ANDROID_STOREPASS='tu-clave' ./build-apk.sh
```

Si `mv-release.keystore` no existe, el script lo crea con esa contraseña en el
primer build. **Guardalo y respaldalo fuera del repo** (gestor de contraseñas o
backup cifrado): una actualización de la APK solo se instala encima de la
anterior si está firmada con la misma clave.

### Clave anterior: rotada por filtración

El keystore original y su contraseña estuvieron commiteados en el repo, así que
se consideran comprometidos. Quedó apartado como
`COMPROMETIDO-NO-USAR-mv-release.keystore` (ignorado por git) y **no debe
volver a usarse**; si hiciera falta, sigue recuperable del historial de git.

La rotación se hizo antes de publicar en Google Play, que es la única ventana
en la que sale gratis: una vez publicada, Play exige la misma clave para toda
actualización y ya no se puede rotar. La contrapartida es que quien haya
instalado la APK vieja bajada de la web **tiene que desinstalar antes de poner
la nueva** (Android rechaza una actualización firmada con otra clave).

## Instalación en el teléfono

Descargar `MV-Agendate-IA.apk` desde `/instalar.html` → al abrirla, Android
pide permitir "instalar apps de origen desconocido" para el navegador → Instalar.
