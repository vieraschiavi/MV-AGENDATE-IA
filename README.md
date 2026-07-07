# Núcleo nuevo — MV Agendate IA

Esto NO es un proyecto aparte: son los 4 módulos que le faltan a tu proyecto
**MV Asistente Inmobiliario** para convertirlo en **MV Agendate IA**. Todo lo
demás (WhatsApp, ChatVoice con Piper/ElevenLabs, MercadoPago, dashboard,
deploy a Vercel, APK) ya está resuelto ahí y se reutiliza tal cual.

## Qué hay en esta carpeta

| Archivo | Reemplaza / se agrega a |
|---|---|
| `src/data/oficios.json` | nuevo — catálogo de precios por oficio y trabajo |
| `src/ai/cotizador.js` | nuevo — equivalente a `src/ai/tasacion.js` pero para trabajos, no propiedades |
| `src/store/agenda.js` | nuevo — no existe hoy; calcula traslados y arma la agenda |
| `src/channels/aviso-retraso.js` | nuevo — usa `enviarWhatsApp()` que ya vive en `src/channels/whatsapp.js` |
| `src/ai/agente-agendate.js` | reemplaza a `src/ai/agente.js` para este rubro |
| `demo-server.js` + `public/demo.html` | solo para probar estos 4 módulos sueltos, antes de mezclarlos |

## Pasos para integrarlo al repo del inmobiliario

1. Copiá `src/data/oficios.json`, `src/ai/cotizador.js`, `src/store/agenda.js`,
   `src/channels/aviso-retraso.js` y `src/ai/agente-agendate.js` a las mismas
   rutas dentro del proyecto `Buscador-Inmobiliario-...`.
2. En `src/channels/whatsapp.js`, importá `revisarYAvisarAgendaDelDia` y
   llamalo desde un `setInterval` cada 5-10 minutos (o desde el cron que ya
   uses), pasándole la función `enviarWhatsApp` que ese archivo ya expone.
3. En `src/server.js`, agregá las rutas nuevas (mismo patrón que las rutas
   `/api/tasar`, `/api/padron`, etc. que ya existen):
   - `POST /api/cotizar` → `cotizar()`
   - `POST /api/agenda/proponer` → `proponerHorarios()`
   - Reemplazá la importación de `agente.js` por `agente-agendate.js` en el
     endpoint `/api/chat` y en los webhooks de WhatsApp/voz.
4. En `data/config.json` (o el panel `/config.html`), agregá un campo
   `oficioProfesional` y `nombreProfesional` para que el agente sepa a quién
   representa — hoy ese panel ya maneja las claves de WhatsApp/Twilio/MercadoPago,
   es el mismo lugar.
5. Ajustá los precios de `oficios.json` con el profesional real: son valores
   de referencia, no precios de mercado validados.
6. Repetí el empaquetado de PC/APK que ya tenés en `movil/` y `empaquetar.sh`,
   solo cambiando nombre/ícono de "MV Asistente Inmobiliario" a "MV Agendate IA".

## Qué falta más allá de estos módulos (no lo resuelve este código)

- **Distancia real** en vez de línea recta: cuando quieras más precisión,
  reemplazá `estimarTiempoTrasladoMin()` en `agenda.js` por una llamada a
  Google Distance Matrix (o Mapbox/OSRM) — el resto del motor no cambia.
- **Geocoding**: hoy `agenda.js` recibe `{lat, lng}` ya resueltos. Falta
  convertir la dirección que escribe el cliente en coordenadas (Google
  Geocoding API o Nominatim/OSM, gratis).
- **Aprobación de Meta para WhatsApp Business** y alta de número en Twilio:
  son trámites del lado de Meta/Twilio, no de código.
- **Multi-profesional** (varios electricistas en un mismo estudio): el motor
  de agenda de acá asume un solo profesional/agenda por cuenta; para varios,
  hay que sumar un `profesionalId` a cada cita.

## Probar este núcleo suelto (opcional, antes de integrarlo)

```bash
npm install
node demo-server.js
# abrir http://localhost:3000/demo.html
```

Sin `ANTHROPIC_API_KEY` cargada como variable de entorno, el chat corre en
modo demo (mismo comportamiento que el proyecto inmobiliario sin clave).
