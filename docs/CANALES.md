# Guía de canales — MV Agendate IA

El mismo agente (`src/ai/agente.js`, con la misma memoria de conversación por
cliente) atiende en todos los canales. Cada canal es un adaptador que traduce
entrada/salida hacia `conversar(sessionId, texto, canal)`.

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
3. En Meta for Developers → WhatsApp → Configuration, apuntá el webhook a
   `https://tu-dominio/webhook/whatsapp` con el mismo verify token.
4. Probá la conexión desde el propio panel (`/config.html` → botón "Probar
   conexión de WhatsApp").

**Ventana de 24 horas:** Meta solo permite mandar un mensaje de texto libre si
el cliente te escribió en las últimas 24 h. El aviso automático de retraso
(`src/channels/aviso-retraso.js`) depende de esto: si pasaron más de 24 h
desde el último mensaje del cliente, Meta rechaza el envío salvo que uses una
plantilla (HSM) pre-aprobada — un trámite manual en Meta Business, no
automatizable por API.

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
hace falta un [Cron Job de Vercel](https://vercel.com/docs/cron-jobs) que
llame a `GET /api/agenda/chequear-retrasos` (ya configurado en `vercel.json`) cada 5-10 minutos.
