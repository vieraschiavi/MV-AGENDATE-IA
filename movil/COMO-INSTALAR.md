# 📲 Instalar MV Agendate IA en el celular

Archivo: **`MV-AgendateIA.apk`** (en esta carpeta `movil/`).
APK **release** compilado con Gradle/Capacitor y firmado con clave propia —
misma estructura que cualquier app de Play Store. Instala en **Android 5.1
(API 22) o superior**.

- Tamaño: **3.53 MB** (3.701.030 bytes)
- MD5: `f1ab0b1401a4944c3f81439174ff1422`
- Firma: **v1 (JAR) + v2 + v3** verificadas (cubre Android 5.1 hasta 14+)
- **No** es debuggable ni testOnly → los instaladores lo aceptan sin rechazo
- Certificado: `CN=MV Agendate IA` (clave de release, no la de debug)

> ✅ **Novedad:** la app ahora funciona **aunque no tenga servidor conectado**.
> Al abrirla ves un catálogo de ejemplo, un tasador orientativo y el chat en
> modo demostración. Cuando cargás la dirección del servidor de tu negocio
> (engranaje ⚙️) pasa a usar el catálogo real y la IA en vivo.

## Instalación (método que siempre funciona)

1. Pasá el archivo `MV-AgendateIA.apk` al teléfono y guardalo en **Descargas**
   (por Google Drive, Telegram como "archivo", o cable USB — **evitá WhatsApp**,
   que a veces cambia el archivo).
2. Abrí **"Archivos"** / **"Mis archivos"** → **Descargas**.
3. Confirmá que el nombre termina en **`.apk`**. Si quedó como `MV-AgendateIA`
   sin extensión, o `.apk.zip` / `.bin`, **renombralo** a `MV-AgendateIA.apk`.
4. Tocá el archivo → Android pide **"Permitir instalar apps de esta fuente"** →
   activalo (es para la app desde la que instalás: Archivos o Chrome).
5. **Instalar**. Listo.

## Si dice "aplicación no instalada" o "paquete no válido"

Casi siempre el archivo se dañó o se renombró al transferirlo:

1. Verificá el **tamaño (3.53 MB)** y, si podés, el **MD5** de arriba
   (app "Hash Droid", o en PC `md5sum MV-AgendateIA.apk`). Si no coincide,
   descargá de nuevo — llegó corrupto.
2. Si ya tenías una versión instalada con **otra firma**, desinstalala primero.
3. Con cable USB y depuración activada, para ver el error exacto:
   ```
   adb install -r MV-AgendateIA.apk
   ```
   El código `INSTALL_FAILED_*` que aparezca indica la causa precisa.

## Alternativa sin instalar nada (recomendada para probar)

No hace falta APK: con el **servidor MV corriendo**, en el celular (misma red
Wi-Fi) abrí en **Chrome** la dirección que el propio servidor imprime al
arrancar, por ejemplo:

```
http://192.168.1.50:3000/movil
```

Luego menú ⋮ → **"Agregar a pantalla de inicio"** y queda como app, sin pasar
por ningún instalador. Es idéntica a la del APK.

---

> Nota técnica: la app es un contenedor liviano (WebView) con la interfaz
> embebida. Sin servidor funciona en modo demostración; con servidor muestra el
> catálogo real, el tasador con IA y el chat/chatvoice del negocio.

## Reconstruir el APK (para el negocio)

APK **release** firmado (recomendado para distribuir):

```
cd movil
bash construir-apk-release.sh
```

Genera `movil/MV-AgendateIA.apk` firmado con `movil/mv-release.keystore`.

> 🔑 **Importante para el negocio:** la primera vez el script crea el
> keystore `mv-release.keystore`. **Guardalo y no lo pierdas**: todas las
> actualizaciones futuras deben firmarse con el mismo keystore para que
> instalen encima de la versión anterior. No se sube al repositorio (es tu
> clave privada). Para regenerarlo con tu propia contraseña, borralo y volvé a
> correr el script, o usá `keytool -genkeypair`.

Versión debug rápida (sólo para pruebas internas): `bash construir-apk-gradle.sh`.
