# 🛠️ MV Agendate IA

**El asistente que cotiza y agenda por vos, en cualquier oficio.** Chatbot y
ChatVoice con IA que atienden por WhatsApp o por teléfono en tu nombre,
cotizan cada trabajo con tu propia lista de precios, arman la agenda
considerando el traslado real entre citas y tus descansos, y avisan solos si
vas a llegar tarde — con un dashboard completo de clientes y facturación.

Para **cualquier profesión u oficio de LATAM** que trabaje con agenda y
desplazamientos: médicos, abogados, escribanos, psicólogos, contadores,
electricistas, plomeros, talleres mecánicos, veterinarios, kinesiólogos y más.
Hay 18 profesiones precargadas y se puede crear cualquier otra desde el panel,
con la moneda del país del profesional (o USD) y precios sugeridos por IA
según su mercado.

---

## 1. Qué hace

1. **Cotiza al instante**: el cliente cuenta qué necesita y el agente calcula
   mano de obra + materiales + traslado con el catálogo de precios cargado
   por el profesional — nunca inventa un número.
2. **Agenda con traslados reales**: propone horarios considerando el tiempo
   de viaje estimado hacia y desde las citas vecinas (no solo la duración del
   trabajo), y respeta la jornada laboral, el almuerzo y los días libres que
   configuró el profesional.
3. **Confirma dirección y receptor**: pregunta si el domicilio es el mismo
   que figura en la base del cliente, y quién va a atender si no es el
   titular. Si el cliente comparte su ubicación nativa de WhatsApp usa esas
   coordenadas directo; si escribe la dirección a mano, la geocodifica sola
   (Nominatim/OSM, gratis) para poder calcular el traslado real.
4. **Avisa retrasos solo**: si un trabajo se extiende, le escribe por
   WhatsApp al próximo cliente 30 minutos antes, disculpando la demora — sin
   que el profesional escriba nada.
5. **Dashboard completo**: CRM de clientes, trabajos por día/semana/mes/año
   con comparativas mes a mes y año a año, facturación total, y exportación a
   Excel/CSV/PDF con filtros.
6. **App PC y Android**: el mismo servidor sirve la web, la demo, el panel y
   una PWA instalable como app (sin Play Store).
7. **Multi-profesional**: un mismo estudio (ej. 3 electricistas) puede cargar
   varios profesionales, cada uno con su propio oficio, jornada y descansos —
   el chatbot identifica cuál corresponde antes de cotizar, y cada uno agenda
   sobre su propia agenda (traslados calculados sin mezclar citas entre
   profesionales). Con uno solo configurado (el caso por defecto) no cambia
   nada del flujo de siempre.
8. **Adaptado a todo LATAM**: el profesional elige su país y la moneda de
   cotización se ajusta sola (o factura en USD a elección); la IA investiga
   los precios de mercado de su país por tipo de trabajo y sugiere el
   catálogo; y un estimador calcula la carga impositiva según la ley local
   (monotributo/BPS, AFIP, SAT, SUNAT, etc.) y el neto mensual — orientativo,
   con descargo. Los servicios profesionales cotizan como honorarios; los
   oficios, como mano de obra + materiales.

## 2. Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js ≥ 20 (ES modules) |
| Servidor | Express |
| Workspace (panel de gestión) | React 18 + Vite (SPA en `/app/`, build commiteado — el deploy no necesita build step) |
| IA | `@anthropic-ai/sdk` (Claude) — chatbot, ChatVoice |
| Voz (TTS) | **Piper** (neuronal, offline, gratis) — voz `es_AR-daniela` rioplatense; opcional ElevenLabs (voz clonada) |
| Voz (ASR) | Deepgram (opcional, ChatVoice premium en tiempo real) |
| Telefonía | Twilio (opcional) |
| Datos | Redis (Upstash) — persiste entre invocaciones serverless |
| Pagos | MercadoPago Checkout Pro (+ suscripción para el costo variable del plan Full) |
| Deploy | Vercel (estático `public/` + función serverless `api/index.js`) + Cron Job para el aviso de retrasos |
| Tests | `node --test` |

Sin build step. Dependencias de producción: `@anthropic-ai/sdk`, `express`,
`ws`, `@upstash/redis`, `botid`.

## 3. Estructura del proyecto

```
src/
  server.js               Servidor Express: monta todas las rutas y canales
  programa.js             Lanzador para la versión PC (setup de clave + server)
  ai/
    agente.js             Cerebro del chatbot (Claude + herramientas: cotizar/agendar/confirmar)
    ayuda.js               Asistente de ayuda del programa (Claude + guía local sin API key)
    cotizador.js           Motor de cotización por oficio y tipo de trabajo
    geocoding.js           Dirección de texto ↔ coordenadas (Nominatim/OSM, gratis)
    precios.js             IA: investiga precios de mercado del país por tipo de trabajo
    impuestos.js           IA: estima impuestos según la ley del país + guía local LATAM
  channels/
    voz.js                ChatVoice vía rápida (Twilio <Gather> + voz neural)
    voz-premium.js         ChatVoice en tiempo real (Deepgram ASR + Piper/ElevenLabs TTS)
    tts-piper.js           TTS con Piper (voz Daniela): WAV (web) y mu-law 8k (teléfono)
    whatsapp.js            Webhook WhatsApp (Meta Cloud API)
    aviso-retraso.js       Detecta demoras y dispara el aviso automático por WhatsApp
  store/
    config.js              Config en caliente + prioridad config.json > env > clave embebida; equipo de profesionales (multi-profesional)
    agenda.js              Motor de agenda: distancias, traslados y huecos disponibles
    trabajos.js            Clientes, citas/trabajos y dashboard (Redis)
    licencias.js           Pedidos, planes, confirmación de pago, token de descarga (HMAC)
    mercadopago.js         Checkout Pro + suscripción recurrente (plan Full)
    demo.js                Cupo de la demo (usos por visitante)
    uso.js                 Tracking de tokens/costos por API
    estadoLicencia.js      Chequeo de suscripción para copias vendidas con licencia gestionada
  exports/documentos.js    Ficha de cita imprimible + agenda/clientes CSV/Excel
  data/oficios.json        Catálogo de oficios, trabajos, precios y tiempos de referencia
  setup/                   Setup de API key por consola + embeber clave (base64)

public/                 Web estática (landing, demo, comprar, config) + build de la SPA en public/app/
webapp/                 Workspace en React 18 + Vite (panel/agenda/clientes/dashboards/ayuda) → npm run build
respaldo/web-clasica/   Versión anterior del workspace (HTML + JS vanilla), por si hay que restaurarla
movil/                  App Android (PWA instalable / APK)
api/index.js            Entrypoint serverless de Vercel
vercel.json             Config de deploy + Cron Job del aviso de retrasos
test/                   Suite de tests (cotizador, agenda, aviso de retraso, agente, geocoding, multi-profesional)
```

## 4. Endpoints principales

- `POST /api/chat` — chat del agente (webchat/demo)
- `POST /api/ayuda` — asistente de ayuda del programa (dudas de uso/configuración)
- `GET /api/oficios` · `GET /api/oficios/:clave` · `POST /api/cotizar` — catálogo y cotización directa
- `POST /api/oficios` · `DELETE /api/oficios/:clave` — crear/borrar profesiones propias (cualquier rubro)
- `GET /api/paises` · `GET /api/parametros` — países LATAM y moneda activa
- `POST /api/precios/sugerir` — IA: qué se cobra en el mercado del país por cada trabajo
- `POST /api/impuestos/estimar` — IA: carga impositiva según la ley del país + neto estimado
- `POST /api/agenda/proponer` — horarios propuestos considerando traslados
- `GET /api/geocoding?direccion=` · `GET /api/geocoding/inverso?lat=&lng=` — dirección ↔ coordenadas
- `GET/POST /api/citas`, `/api/citas/:id/estado`, `/api/citas/:id/receptor`, `/api/citas/:id/ficha`
- `GET/POST /api/clientes`, `/api/cliente/:id/confirmar-direccion`, `/api/cliente/:id/profesional`
- `GET/POST /api/profesionales` — equipo de profesionales de la cuenta (multi-profesional)
- `GET /api/dashboard`, `/api/dashboard/serie`, `/api/dashboard/serie-anual`, `/api/dashboard/filtros`
- `GET /api/agenda.csv` · `/api/agenda.xls` · `/api/clientes.csv` · `/api/clientes.xls` — exportación con filtros
- `GET /api/agenda/chequear-retrasos` (cron) / `POST` (manual, admin) — dispara los avisos de demora
- `GET /api/planes` · `POST /api/comprar` · `POST /api/pago/mercadopago` (webhook) · `GET /descargar/:token`
- `GET/POST /webhook/whatsapp`, `POST /webhook/voz`, `POST /webhook/voz-premium` — canales externos

Ver `docs/CANALES.md` para la guía completa de configuración de cada canal.

## 5. Arrancar en local

```bash
npm install
npm start          # pide la API key la primera vez (o Enter para modo demo)
# abrir http://localhost:3000
```

Páginas: `/` (landing), `/demo.html` (demo chat + cotizador + agenda),
`/config.html` (configuración), `/comprar.html`, y el **workspace React** en
`/app/` (panel del día, agenda, clientes, dashboards y ayuda con IA — las URLs
viejas `/panel.html`, `/agenda.html`, etc. redirigen solas). Para tocar el
workspace: `cd webapp && npm install && npm run build` (el build queda
commiteado en `public/app/`, así el deploy sigue sin build step).

## 6. Planes y precios

| | Básico — USD 129 | Full (con IA) — USD 299 |
|---|---|---|
| Agenda con traslados y descansos + cotizador multi-oficio | ✓ | ✓ |
| CRM de clientes + dashboards + exportación Excel/PDF | ✓ | ✓ |
| App PC / Android | ✓ | ✓ |
| Chatbot y ChatVoice con IA (WhatsApp/voz) | — | ✓ |
| Aviso automático de retraso | — | ✓ |

Pago único vía MercadoPago o transferencia (`/comprar.html`). El plan Full usa
las cuentas propias del profesional (Claude, WhatsApp Business, y Twilio si
quiere voz) — ese costo de uso corre aparte, directo a esos proveedores.

### Competencia y precios (relevamiento LATAM/Uruguay)

No se encontró en Uruguay/LATAM un competidor que venda **exactamente este
combo** (chatbot/voz con IA + cotización por oficio + agenda con traslados +
aviso de retraso) como pago único — la categoría entera es por suscripción.
Los más cercanos son bots genéricos de agenda por WhatsApp con IA (CitaFlow,
SyncManager, aunoa.ai — todos desde USD 14-120/mes) y SaaS de turnos sin IA
como **AgendaPro** (fuerte en Argentina/Uruguay/Chile/México, planes
USD 19-59/mes), ninguno con cotizador por oficio ni optimización de
traslados. Ese combo específico es un hueco real en el mercado.

Sobre el presupuesto de IA: con Claude Haiku (el modelo económico), una
conversación típica de WhatsApp cuesta aproximadamente USD 0.01-0.02 sin
optimizar. Con USD 20/mes eso alcanza para **~1.300-4.000 conversaciones
mensuales por profesional** — un volumen realista para un oficio
independiente, pero es un presupuesto **por profesional**, no un pool
compartido entre varios. La voz (Twilio + ASR/TTS) suma un costo aparte no
cubierto por esos USD 20; un estimado más realista para el plan Full con uso
de voz es USD 25-50+/mes. Por eso el plan Full no se vende con ese costo de
API incluido en el pago único: es variable y corre directo a las cuentas del
profesional.

El pago único para el plan Básico (sin IA) tiene precedente en el mercado
(software de gestión para talleres/comercios vendido con licencia perpetua);
para el plan Full, un pago único "puro" sería mala idea porque el costo de
IA/telefonía es variable — de ahí el modelo híbrido (pago único del software +
costo de API aparte, sin markup).

## 7. Qué falta más allá del código (no lo resuelve este repo)

- **Distancia real** en vez de línea recta: `estimarTiempoTrasladoMin()` en
  `agenda.js` usa Haversine + velocidad promedio configurable; para más
  precisión, reemplazarla por una llamada a Google Distance Matrix (o
  Mapbox/OSRM) sin tocar el resto del motor.
- **Aprobación de Meta para WhatsApp Business** y alta de número en Twilio:
  son trámites del lado de Meta/Twilio, no de código — ver `docs/CANALES.md`.
- **Precios de `oficios.json`** son valores de referencia en UYU — hay que
  ajustarlos con el precio real de cada profesional y su competencia local
  antes de vender.
- **Firma de la APK release**: `movil/construir-apk-release.sh` genera un
  certificado nuevo si no existe uno — para publicar en Play Store hace falta
  una cuenta de desarrollador de Google y (opcionalmente) Play App Signing.

## 8. Tests

```bash
npm test
```
