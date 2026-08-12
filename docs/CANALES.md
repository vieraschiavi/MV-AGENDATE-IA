# Guía de canales — MV Agendate IA

El mismo agente (`src/ai/agente.js`, con la misma memoria de conversación por
cliente) atiende en todos los canales. Cada canal es un adaptador que traduce
entrada/salida hacia `conversar(sessionId, texto, canal)`.

**Multi-profesional:** un mismo número de WhatsApp (o el mismo webchat/teléfono)
puede representar a un estudio con varios profesionales (ver "Equipo" en
`/config.html`). El agente identifica en la conversación cuál corresponde
(por el oficio pedido o porque el cliente lo nombra) antes de cotizar — no
hace falta un canal ni un número separado por profesional.

## 1. Webchat (incluido, cero configuración)

`public/demo.html` y el widget embebible (`public/widget.js`) llaman a
`POST /api/chat`. Sin ninguna clave configurada corre en modo demo (respuestas
simuladas); con `ANTHROPIC_API_KEY` cargada en `/config.html` pasa a IA real
al instante, sin reiniciar el servidor.

## 2. WhatsApp (Meta Cloud API)

1. Creá una app de WhatsApp Business en [Meta for Developers](https://developers.facebook.com/).
2. Cargá `whatsappToken`, `whatsappPhoneId` y `whatsappVerifyToken` en
   `/config.html` (o como variables de entorno `WHATSAPP_TOKEN` /
   `WHATSAPP_PHONE_ID` / `WHATSAPP_VERIFY_TOKEN`).
3. **Cargá también `whatsappAppSecret`** (`WHATSAPP_APP_SECRET`) — está en Meta
   → Configuración de la app → Básica → *Clave secreta de la app*. Ver
   "Firma de los webhooks" más abajo: sin esto el webhook queda abierto.
4. En Meta for Developers → WhatsApp → Configuration, apuntá el webhook a
   `https://tu-dominio/webhook/whatsapp` con el mismo verify token.
5. Probá la conexión desde el propio panel (`/config.html` → botón "Probar
   conexión de WhatsApp").

**Ventana de 24 horas:** Meta solo permite mandar un mensaje de texto libre si
el cliente te escribió en las últimas 24 h. El aviso automático de retraso
(`src/channels/aviso-retraso.js`) depende de esto: si pasaron más de 24 h
desde el último mensaje del cliente, Meta rechaza el envío salvo que uses una
plantilla (HSM) pre-aprobada — un trámite manual en Meta Business, no
automatizable por API.

**Ubicación compartida:** si el cliente manda su ubicación con el botón
nativo de WhatsApp (📎 → Ubicación), el webhook la reconoce (`type:
"location"`) y le pasa las coordenadas exactas al agente — no hace falta
geocodificar nada en ese caso. Si en cambio escribe la dirección a mano, el
agente la geocodifica solo con Nominatim/OSM (`src/ai/geocoding.js`, gratis,
sin API key) antes de calcular horarios.

## 2.b Firma de los webhooks (importante en producción)

Los webhooks (`/webhook/whatsapp`, `/webhook/voz`, `/webhook/voz-premium`) son
públicos y deciden **de qué cuenta es el mensaje mirando el propio cuerpo del
request**: el `phone_number_id` que manda Meta, el campo `To` que manda Twilio.

Eso significa que sin verificar la firma, cualquiera que conozca el número de un
profesional —que es público, está en su perfil de negocio— puede POStear un
mensaje falso a su nombre: meterle citas y clientes truchos en el CRM, gastarle
los créditos de IA y de voz, e inyectarle texto al agente. Sin credenciales y
sin pasar por Meta ni por Twilio.

La verificación cierra eso: quien POStea puede seguir **diciendo** ser cualquier
cuenta, pero el HMAC solo cierra si tiene la clave secreta de esa cuenta.

| Canal | Con qué se firma | De dónde sale |
|---|---|---|
| WhatsApp | `whatsappAppSecret` / `WHATSAPP_APP_SECRET` | Meta → app → Básica → Clave secreta |
| Voz (Twilio) | `twilioAuthToken` / `TWILIO_AUTH_TOKEN` | El mismo que ya usás para llamar |

**Mientras no haya secreto cargado, el webhook sigue funcionando** (para no
romper instalaciones que ya están andando) pero avisa por consola. Con
`MV_WEBHOOKS_ESTRICTOS=1` se rechaza en vez de pasar — **es lo que conviene
dejar puesto en un deploy de producción**, una vez cargados los secretos.

## 3. Teléfono — ChatVoice vía rápida (`src/channels/voz.js`)

Usa Twilio `<Gather input="speech">` para el reconocimiento de voz y, para la
respuesta hablada: ElevenLabs (voz clonada, si está configurada) o, si no,
`<Say>` con voz neural de Twilio (Polly) como respaldo. Cargá
`twilioAccountSid` / `twilioAuthToken` en `/config.html`, comprá un número
desde el mismo panel (autoconfigura el webhook) y listo.

## 4. Teléfono — ChatVoice premium (`src/channels/voz-premium.js`)

Pipeline en tiempo real: Twilio Media Streams → Deepgram (ASR streaming) →
agente → Piper (voz `es_AR-daniela`, rioplatense, gratis y offline) o
ElevenLabs → de vuelta a la llamada. Requiere `DEEPGRAM_API_KEY` además de
Twilio. Sin Deepgram, `/webhook/voz-premium` redirige solo a la vía rápida.

**Nota Vercel:** este pipeline necesita un WebSocket de larga duración —
funciona en un servidor persistente (PC/VPS), no en funciones serverless. En
Vercel, el ChatVoice funciona en su variante "vía rápida" (punto 3).

## 5. Aviso automático de retraso

`src/channels/aviso-retraso.js` compara la hora estimada de fin del trabajo en
curso contra la próxima cita del día; si detecta 30+ minutos de demora, avisa
por WhatsApp al próximo cliente. En un servidor persistente corre solo cada 5
minutos (`setInterval` en `src/server.js`); en Vercel (sin procesos de fondo)
hace falta que algo externo llame a `GET /api/agenda/chequear-retrasos` cada
5-10 minutos.

**Los Cron Jobs nativos de Vercel (`vercel.json` → `"crons"`) están limitados a
1 ejecución por día en el plan Hobby/gratis** — una expresión como `*/10 * * * *`
directamente bloquea el deploy con el error "cuentas Hobby están limitadas a
tareas programadas diarias". Por eso `vercel.json` NO declara ningún cron; en
su lugar, apuntá un servicio externo gratuito al endpoint:

- **cron-job.org** (gratis, sin cuenta de GitHub): creá un cron que haga
  `GET https://tu-dominio.vercel.app/api/agenda/chequear-retrasos` cada 5-10 min.
- **GitHub Actions** (gratis en repos públicos, minutos limitados en privados):
  un workflow con `schedule: cron: '*/10 * * * *'` que haga un `curl` al mismo endpoint.

Si en cambio tenés plan Pro de Vercel, podés volver a declarar el cron nativo
en `vercel.json` (`"crons": [{ "path": "/api/agenda/chequear-retrasos", "schedule": "*/10 * * * *" }]`) sin este límite.
