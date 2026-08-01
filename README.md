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
9. **El precio siempre lo aprueba el profesional**: la cotización que calcula
   el agente es un sugerido interno — el chatbot NO le dice ningún monto al
   cliente hasta que el profesional lo apruebe tal cual (o lo ajuste) desde el
   Panel. Cada pendiente le llega por WhatsApp; al aprobar, el cliente recibe
   el precio confirmado al instante. Se puede pasar a "precio directo" desde
   `/config.html` (y la demo pública fluye sola).
10. **Modo SaaS multi-cliente**: además de la versión descargable, cuentas
    online con email/contraseña (`/app` → Cuenta online): 14 días de prueba
    gratis y suscripción de USD 15/mes por MercadoPago. Cada cuenta tiene sus
    clientes/citas/dashboards aislados (namespacing por cuenta en Redis) **y
    su configuración propia** (profesión, país/moneda, catálogo, horarios,
    equipo, aprobación de cotizaciones, credenciales de canales): un contexto
    por request (AsyncLocalStorage) superpone los overrides de la cuenta a la
    config global, así cotizador/agente/agenda la resuelven sin cambios. El
    webhook de WhatsApp rutea cada mensaje entrante a la cuenta dueña del
    Phone Number ID, y el de voz (Twilio) rutea cada llamada a la cuenta
    dueña del número marcado — cada cuenta puede conectar su propio WhatsApp
    Business, su número de teléfono y su API key de Claude, y su asistente
    atiende con su catálogo y agenda en sus datos. Sin token, todo sigue
    operando sobre la cuenta `default` — el modo single-tenant no cambia.

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
| Deploy | Vercel (estático `public/` + función serverless `api/index.js`) — aviso de retrasos vía cron externo gratuito (ver docs/CANALES.md; los Cron Jobs nativos de Vercel Hobby están limitados a 1/día) |
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
vercel.json             Config de deploy (sin Cron Job nativo: ver docs/CANALES.md)
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
- `GET /api/agenda/chequear-retrasos` (cron externo gratuito, ver docs/CANALES.md) / `POST` (manual, admin) — dispara los avisos de demora
- `GET /api/cotizaciones?estado=pendiente` · `POST /api/cotizaciones/:id/resolver` — aprobación de cotizaciones (el chatbot no da precio sin OK del profesional)
- `POST /api/auth/registro` · `POST /api/auth/login` · `GET /api/auth/yo` — cuentas del modo SaaS (con `Authorization: Bearer <token>`, todas las rutas del workspace operan sobre los datos aislados de esa cuenta, y `/api/config`, `/api/oficios`, `/api/profesionales`, `/api/cotizar` leen/escriben la configuración PROPIA de la cuenta)
- `GET /api/admin/cuentas` · `POST /api/admin/cuentas/:id/estado` — panel del VENDEDOR (clave admin global): todas las cuentas SaaS con métricas (clientes/citas/facturado/pendientes) y activación/suspensión manual
- `GET /api/planes` · `POST /api/comprar` · `POST /api/pago/mercadopago` (webhook) · `GET /descargar/:token`
- `GET/POST /webhook/whatsapp`, `POST /webhook/voz`, `POST /webhook/voz-premium` — canales externos

Ver `docs/CANALES.md` para la guía completa de configuración de cada canal.

## 5. Arrancar en local

```bash
npm install
npm start          # pide la API key la primera vez (o Enter para modo demo)
# abrir http://localhost:3000
```

Páginas: `/` (landing), `/online.html` (página de venta del plan SaaS),
`/demo.html` (demo chat + cotizador + agenda),
`/config.html` (configuración), `/comprar.html`, y el **workspace React** en
`/app/` (panel del día, agenda, clientes, dashboards y ayuda con IA — las URLs
viejas `/panel.html`, `/agenda.html`, etc. redirigen solas). Para tocar el
workspace: `cd webapp && npm install && npm run build` (el build queda
commiteado en `public/app/`, así el deploy sigue sin build step).

## 6. Planes y precios

| | Básico — USD 129 | Full (con IA) — USD 299 | SaaS online — USD 15/mes |
|---|---|---|---|
| Agenda con traslados y descansos + cotizador multi-oficio | ✓ | ✓ | ✓ |
| CRM de clientes + dashboards + exportación Excel/PDF | ✓ | ✓ | ✓ |
| App PC / Android | ✓ | ✓ | (web, sin instalar) |
| Chatbot y ChatVoice con IA (WhatsApp/voz) | — | ✓ | fase 2 |
| Aviso automático de retraso | — | ✓ | fase 2 |
| Cuenta online con datos aislados + 14 días gratis | — | — | ✓ |

Básico/Full: pago único vía MercadoPago o transferencia (`/comprar.html`). El
plan Full usa las cuentas propias del profesional (Claude, WhatsApp Business,
y Twilio si quiere voz) — ese costo de uso corre aparte, directo a esos
proveedores. SaaS: suscripción mensual por MercadoPago (Preapproval, cobro en
UYU), registro en `/app` → Cuenta online; el webhook de MercadoPago
activa/suspende la cuenta sola según el estado de la suscripción (matcheando
el email del pagador).

**Prueba gratis de la copia descargable (3 días):** al primer arranque, la
copia PC/APK funciona completa durante `DIAS_PRUEBA` días (default 3, `0` =
sin límite). Al vencer sin licencia, el workspace se corta (las rutas de datos
devuelven 402 y la SPA muestra un candado con "Comprar" + activar licencia);
la landing/demo, `/api/planes`, `/api/comprar` y la activación siguen vivas.
Se levanta ingresando el código de licencia que llega al pagar
(`POST /api/licencia/activar` → guarda `licenciaLocal`). NO aplica en el host
Vercel (marketing + SaaS) ni a cuentas SaaS (que tienen su propio trial de 14
días por cuenta). Store: `src/store/prueba.js`.

**Proveedor de IA elegible (Claude / ChatGPT / Gemini):** cada profesional
elige su proveedor en `/config.html` (campo `proveedorIA`) y pega SU propia API
key (`anthropicApiKey` / `openaiApiKey` / `geminiApiKey`). El agente funciona
igual con cualquiera — `src/ai/llm.js` traduce el historial (bloques Anthropic)
al formato de cada proveedor y de vuelta; Claude usa el SDK, OpenAI y Gemini
por REST (sin dependencias nuevas). Configurable por cuenta SaaS también.
Copilot no expone una API general para este uso; para modelos Microsoft/Azure
se usa la opción OpenAI con endpoint propio. Modelos por defecto (override por
env): `MODELO_CLAUDE`, `MODELO_OPENAI` (gpt-4o), `MODELO_GEMINI` (gemini-1.5-flash).

**Demo del sitio hosteado:** para que el chatbot de la web responda con IA
real (y no con la lógica local de respaldo), configurá la API key del proveedor
elegido como variable de entorno del proyecto en Vercel (`ANTHROPIC_API_KEY` /
`OPENAI_API_KEY` / `GEMINI_API_KEY`) — o embebida con `npm run embeber-clave`.
Sin clave, la demo igual conversa con una lógica local (detecta el trabajo,
cotiza y agenda) y nunca le pide credenciales al visitante.

**PWA / Android:** el workspace (`/app`) es una PWA instalable
(`public/manifest.webmanifest`, `display: standalone`, `start_url: /app/`) —
"Agregar a pantalla de inicio" la abre a pantalla completa como app nativa, en
PC y Android. Inputs a 16px en móvil (sin zoom automático de iOS), targets
táctiles grandes y `safe-area` para el notch — pensado para el profesional
usándolo en la calle desde el celular.

**Video promocional:** `public/video/mv-agendate-ia.mp4` (voz rioplatense
Piper), embebido en la landing (`#video`) y en `/online.html`.

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

Corren con `node --test` (nativo, sin framework externo) y **no necesitan
nada más que Node instalado** — sin `.env`, sin clave de IA, sin Redis real
(hay un fallback en memoria en `src/store/redis.js`) y sin `data/` previo
(se crea solo si algún test lo necesita, y no se versiona). En una máquina
limpia, recién clonado el repo:

```bash
git clone https://github.com/vieraschiavi/mv-agendate-ia.git
cd mv-agendate-ia
npm ci            # o npm install si no hay package-lock.json fresco
npm test          # node --test — corre los ~110 tests de test/*.test.js
npm run lint      # eslint . — 0 errores esperados
```

Sin preguntarle a nadie, sin pedir credenciales: los tests que tocan un
servicio externo (MercadoPago, Nominatim/geocoding, los proveedores de IA)
mockean `fetch` en vez de pegarle a la red real — ver el patrón
`conFetchMock()` en `test/geocoding.test.js`, `test/mercadopago.test.js` y
`test/estadoLicencia.test.js`.

**Cobertura real** (usa el reporter nativo de Node, no un paquete aparte):

```bash
node --test --experimental-test-coverage
```

Los módulos que tocan dinero (`licencias.js`, `mercadopago.js`,
`suscripciones.js`, `estadoLicencia.js`) se mantienen con cobertura de
línea/rama igual o mayor al promedio del resto del código — ver
`test/licencias.test.js`, `test/mercadopago.test.js`,
`test/suscripciones.test.js` y `test/estadoLicencia.test.js`.

**Advertencia de deprecación conocida:** al correr la suite puede aparecer
`DeprecationWarning: The 'punycode' module is deprecated` (DEP0040). No sale
de código propio: es una dependencia transitiva de `@anthropic-ai/sdk@0.39.0`
(vía `node-fetch@2` → `whatwg-url@5` → `tr46@0.0.3`, que todavía usa el
`punycode` embebido de Node). Versiones más nuevas del SDK (`0.115.x`)
eliminan esa cadena por completo, pero es un salto de ~76 versiones menores
sobre la dependencia más sensible del proyecto (el motor de IA del chatbot) —
no se sube en este PR sin probarla a fondo contra conversaciones reales
primero. Queda documentado acá en vez de silenciarlo con una flag.
