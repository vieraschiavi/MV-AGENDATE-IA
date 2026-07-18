# CLAUDE.md — MV Agendate IA

Guía operativa para trabajar en este repo con Claude Code. Leé esto antes de tocar nada.

## Qué es

**MV Agendate IA** es un chatbot / ChatVoice con IA que atiende clientes de cualquier
oficio de LATAM por **WhatsApp** o por **voz (teléfono)**. Cotiza trabajos con la lista
de precios del profesional (nunca inventa montos), arma la agenda considerando el
traslado real entre citas y los descansos, avisa retrasos solo, y ofrece un dashboard
con CRM de clientes y facturación. Corre como app PC (Electron) + PWA Android y como
**SaaS multi-cliente** (cuentas online con prueba y suscripción MercadoPago). El precio
final siempre lo aprueba el profesional antes de comunicárselo al cliente.

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js ≥ 20, ES modules (`"type": "module"`) |
| Servidor | Express (serverless en Vercel: `api/index.js`) |
| IA | `@anthropic-ai/sdk` (Claude) — chatbot y ChatVoice |
| Voz TTS/ASR | Piper (offline) / ElevenLabs opcional; Deepgram ASR opcional |
| Telefonía | Twilio (opcional) |
| Datos | Redis (Upstash) — persiste entre invocaciones serverless |
| Pagos | MercadoPago Checkout Pro + suscripción |
| Panel | React 18 + Vite (SPA en `public/app/`, build ya commiteado — sin build step) |
| Desktop / móvil | Electron (`electron/main.cjs`) + PWA (`movil/`) |
| Deploy | Vercel (estático `public/` + función `api/index.js`) |
| Tests | `node --test` (nativo, sin framework externo) |

## Comandos

| Objetivo | Comando |
|---|---|
| Instalar deps | `npm ci` (o `npm install` si no hay lockfile fresco) |
| Correr tests | `npm test` (= `node --test`) |
| Servidor de desarrollo (watch) | `npm run dev` (= `node --watch src/server.js`) |
| Servidor (sin watch) | `npm run servidor` (= `node src/server.js`) |
| Lanzador versión PC | `npm start` (= `node src/programa.js`) |
| Configurar (setup interactivo) | `npm run configurar` |
| Embeber clave API en el build | `npm run embeber-clave` |
| Empaquetar paquete PC (zip) | `npm run empaquetar-pc` |
| Empaquetar instalador Windows (.exe) | `npm run empaquetar-exe` |

> No hay linter configurado. No hay build step del panel (el bundle de Vite está
> commiteado en `public/app/`). El deploy lo maneja Vercel; ver `vercel.json`.

## Estructura

```
api/index.js          Entrypoint serverless de Vercel (envuelve el server Express)
src/
  server.js           Servidor Express: monta rutas y canales
  programa.js         Lanzador de la versión PC (setup de clave + server)
  ai/                 agente.js, ayuda.js, cotizador.js, geocoding.js, precios.js, impuestos.js
  channels/           voz.js, voz-premium.js, tts-piper.js, whatsapp.js, aviso-retraso.js
  store/              config.js, agenda.js, trabajos.js, licencias.js, mercadopago.js, demo.js, uso.js, estadoLicencia.js
  data/               Datos base empaquetados
  exports/            Exportación a Excel/CSV/PDF
  setup/              configurar.js, embeber.js
public/               Sitio estático + panel React (public/app/) + demo/landing
electron/main.cjs     App de escritorio (Electron)
movil/                PWA Android (Capacitor)
test/                 *.test.js (node --test)
scripts/              empaquetar-pc.sh y utilidades de packaging
docs/                 CANALES.md y documentación
```

## Flujo de trabajo (plan → cambio → test → ship)

1. **Plan** (`/plan`): explorá en modo solo-lectura, identificá los archivos a tocar y
   proponé un plan. Esperá aprobación antes de editar.
2. **Cambio**: hacé la edición mínima y enfocada. Respetá ESM y las convenciones de abajo.
3. **Test** (`/test`): corré `npm test`. No sigas si hay tests en rojo.
4. **Ship** (`/ship`): `git add` selectivo, commit descriptivo, push a la rama de trabajo,
   y PR en **draft**.

## Convenciones

- **ES modules siempre**: `import`/`export`, nunca `require` (salvo `electron/main.cjs`,
  que es `.cjs`). Extensiones `.js` explícitas en imports relativos.
- **Español rioplatense** en textos de usuario, comentarios y mensajes.
- **Nunca inventar montos**: la cotización sale del catálogo del profesional; el precio
  al cliente lo aprueba el profesional. No hardcodees precios en el código.
- **Secretos por entorno**: API keys y tokens van en `.env` (ver `.env.example`), nunca
  en el código ni en commits. Redis namespacing por cuenta en modo SaaS.
- **Multi-profesional / multi-cuenta**: los cambios en agenda/cotización no deben mezclar
  datos entre profesionales ni entre cuentas (AsyncLocalStorage por request).
- **Tests con `node --test`**: los archivos van en `test/*.test.js`.

## Do / Don't

**Do**
- Correr `npm test` antes de cada commit.
- Mantener paridad de comportamiento entre single-tenant (cuenta `default`) y SaaS.
- Usar `git status` / `git diff` para revisar antes de commitear.
- Leer `docs/CANALES.md` antes de tocar WhatsApp/voz/cron.

**Don't**
- No commitees `.env`, claves, `src/clave-embebida.b64`, `*.keystore`, `*.onnx`.
- No corras `rm -rf` ni `git push --force`.
- No agregues un build step del panel: el bundle ya está commiteado.
- No rompas ESM introduciendo `require` en `src/`.
- No expongas datos de una cuenta a otra.

## Contexto / Compact

Repo mediano con mucho estático en `public/`. Para no saturar contexto:
- Enfocá la lectura en `src/` (la lógica viva); `public/` es mayormente assets/HTML.
- Ignorá `package-lock.json`, `movil/android-apk/`, `promo/`, `voces/*.onnx` salvo que sea
  el objetivo directo.
- Usá el subagente `explorer` para mapear a lo ancho sin volcar archivos enteros.
- Compactá tras cerrar cada tarea (plan→test→ship) para arrancar la siguiente liviano.
