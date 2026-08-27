---
description: Gate final de producción — confirma con evidencia real que el proyecto está 100% listo
---

Este es el checkpoint final antes de decir "listo para producción". No es una
opinión: cada punto necesita evidencia ejecutada (comando corrido, archivo:línea
citado, respuesta real de una API), nunca "debería estar bien". Si algo no se
puede verificar desde acá (por ejemplo, una variable de entorno en Vercel), decilo
explícitamente en vez de asumir que está cargada.

## 1. Base de código

1. Corré `npm run lint && npm test` y pegá el resultado real (CI corre lint
   primero — si lint falla, los tests ni se ejecutan).
2. Si algo falla, no sigas: diagnosticá la causa raíz y arreglá antes de continuar
   con el resto del checklist.

## 2. Seguridad y flujo de pago→licencia

Verificá con cita de código (archivo:línea), no de memoria:

- Webhook de MercadoPago: ¿se valida antes de marcar un pedido como pagado?
- Firma de licencias (Ed25519, `licencia-firma.js`): solo la clave pública
  verifica client-side; `MV_LICENCIAS_HEREDADAS` es un allowlist explícito, no
  un patrón.
- `soloAdmin` / `igualSeguro`: comparación a tiempo constante, todas las rutas
  `/api/admin/*` protegidas.
- Firmas de Twilio y WhatsApp validadas antes de procesar webhooks entrantes.
- Aislamiento multi-cuenta: todo acceso a Redis namespaced por cuenta, sin fugas
  entre profesionales.
- Sin secretos hardcodeados; `.gitignore` cubre `.env`, `*.pem`, `*.keystore`,
  `*.onnx`.
- HTML dinámico (emails, `/monitor.html`, WhatsApp) escapa contenido de usuario
  (`escaparHtml`) en todos los puntos que corresponde.

## 3. Frontend, imágenes e idioma (ES/EN/PT)

- Ningún texto solapado sobre imágenes de fondo sin contraste/overlay seguro.
- Imágenes con `max-width: 100%` / `object-fit` — se ajustan al marco, no
  desbordan ni se recortan mal.
- Contenido de `public/index.html`, `public/en/`, `public/pt/` realmente
  traducido (no solo el video) — sin frases sueltas en español colándose en
  /en o /pt, ni al revés.
- Voz/TTS (Piper/ElevenLabs) y `<Gather>` de Twilio siguen el idioma
  configurado, no quedan hardcodeados.

## 4. Producción real (lo que no se puede ver desde el código)

Estas dependen de configuración en Vercel — si no se puede confirmar en vivo
(`/api/diagnostico`), listalas como pendientes de confirmar por el dueño, nunca
como "hecho":

- `MV_LICENCIA_PRIVADA_PEM` cargada (sin esto ninguna licencia se activa).
- Redis conectado (`KV_REST_API_URL`/`TOKEN` o equivalente Upstash).
- `MERCADOPAGO_TOKEN` en modo producción, `SITIO_URL` correcto.
- `RESEND_API_KEY` + `EMAIL_FROM` si se depende de avisos por mail.

## 5. Veredicto

Cerrá con una tabla: área → PASS / FAIL / NO VERIFICABLE DESDE ACÁ, con la
evidencia de cada una. Si hay algo en FAIL o NO VERIFICABLE, el proyecto **no**
está 100% — decilo así de directo, no lo suavices.

Alcance opcional (para acotar el audit a un área): $ARGUMENTS
