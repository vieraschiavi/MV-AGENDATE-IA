> ⚠️ **Esta carpeta es la versión artesanal (aapt2+d8), sólo de referencia.**
> El APK **recomendado** es el de Gradle/Capacitor: `movil/MV-AgendateIA.apk`
> (ver `movil/COMO-INSTALAR.md`). Instala en todos los teléfonos y ya trae el
> modo demostración offline.

# 📲 Cómo instalar MV-AgendateIA.apk en el celular

El APK está firmado (v1+v2+v3) y verificado. Instala en cualquier **Android 7.0 o superior**. Si "no lo detecta el instalador", casi siempre es por cómo llegó el archivo al teléfono. Seguí estos pasos:

## Paso a paso (método que siempre funciona)

1. **Descargá el archivo a la carpeta Descargas** del teléfono (no lo abras desde el chat/preview).
2. Abrí la app **"Archivos"** o **"Mis archivos"** del teléfono → carpeta **Descargas**.
3. Confirmá que el archivo se llama exactamente **`MV-AgendateIA.apk`**.
   - Si aparece como `MV-AgendateIA` (sin `.apk`), o `.apk.zip`, o `.bin` → **renombralo** a `MV-AgendateIA.apk` (mantené presionado → Renombrar).
4. Tocá el archivo. Android va a pedir permiso: **"Permitir instalar apps de esta fuente"** → activalo (es para la app desde la que instalás: Archivos o Chrome).
5. Tocá **Instalar**. Listo.

## Si dice "aplicación no instalada" o "paquete dañado"

- El archivo se corrompió en la transferencia. **Volvé a descargarlo** (mejor con Chrome, guardando en Descargas) y repetí. No lo mandes por WhatsApp (a veces lo bloquea o lo cambia): usá Google Drive, Telegram como "archivo", o cable USB.
- Verificá el tamaño: debe ser **~21 KB**.

## Con cable USB (a prueba de todo)

En una PC con el teléfono conectado y **depuración USB** activada:

```
adb install MV-AgendateIA.apk
```

## Verificar que el archivo llegó entero (opcional)

MD5 esperado del APK v1.2:

```
3c20ad40474d74b2413c55edb6956260
```

En el teléfono, con una app tipo "Hash Droid", o en PC con `md5sum MV-AgendateIA.apk`, el resultado debe coincidir. Si no coincide, el archivo se dañó al transferirlo → descargá de nuevo.

## Alternativa sin instalar nada (PWA)

Si tenés el servidor MV corriendo (ver `docs/DESPLIEGUE.md`), en el celular abrí en **Chrome** la dirección `https://tu-servidor/movil` y usá el menú ⋮ → **"Agregar a pantalla de inicio"**. Queda como app, sin pasar por ningún instalador de APK.

---

> Nota técnica: la app es un contenedor liviano (WebView) que se conecta al servidor de tu negocio. Al abrirla por primera vez, tocá el engranaje ⚙️ y cargá la dirección del servidor. Por eso el APK es pequeño (~21 KB): todo el catálogo, el tasador y el chat viven en el servidor.
