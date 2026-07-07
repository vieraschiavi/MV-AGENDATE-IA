# 📱 MV Agendate IA — App Android

App móvil para los **clientes** del profesional u oficio (electricistas, plomeros, abogados, etc.): catálogo de trabajos/servicios, cotizador gratis (el gancho para captar clientes), chat con el agente IA que cotiza y agenda citas, y contacto directo. Diseño mobile-first con la marca MV.

## Opción 1 — Instalar YA como app (PWA, sin Play Store)

La app se sirve desde la propia plataforma en **`https://TU-DOMINIO/movil`**:

1. Abrir esa URL en Chrome (Android).
2. Menú ⋮ → **"Agregar a pantalla de inicio"** (o el banner "Instalar app").
3. Queda instalada con ícono propio, pantalla completa y carga instantánea (service worker).

Ventaja comercial: cada profesional cliente tiene "su app" sin pagar cuenta de Google Play.

## Opción 2 — APK nativo (Google Play) con Capacitor

Requiere Android Studio en tu máquina:

```bash
cd movil
npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "MV Agendate IA" com.mv.agendate --web-dir .
npx cap add android
npx cap sync
npx cap open android   # compilar/firmar el APK desde Android Studio
```

> Para que el APK apunte a tu servidor, editá en `index.html` las llamadas `fetch('/api/...')` a la URL absoluta `https://TU-DOMINIO/api/...` (o agregá `"server": { "url": "https://TU-DOMINIO/movil" }` en `capacitor.config.json` para modo remoto).

## Qué incluye

| Pestaña | Función |
|---|---|
| 🏠 Inicio | Catálogo con filtros, botón "Me interesa" que agenda una cita vía chat |
| 🏷️ Tasar | Cotizador con GPS ("usar mi ubicación") — mismo motor del servidor |
| 💬 Chat | El agente MV completo (cotiza, agenda, capta el lead) |
| 📞 Contacto | Formulario "que me llamen" → lead directo al panel del profesional |
