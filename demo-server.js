// Servidor demo — MV Agendate IA (núcleo nuevo)
//
// Levanta 3 endpoints para probar el cotizador, el motor de agenda y el
// agente conversacional de forma aislada, ANTES de integrarlos al repo
// completo del "MV Asistente Inmobiliario" (que ya trae WhatsApp, voz,
// MercadoPago, dashboard y deploy a Vercel armados).
//
// Uso:
//   npm install
//   node demo-server.js
//   http://localhost:3000/demo.html

import express from 'express';
import { cotizar, listarOficios } from './src/ai/cotizador.js';
import { proponerHorarios } from './src/store/agenda.js';
import { conversar } from './src/ai/agente-agendate.js';

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.get('/api/oficios', (_req, res) => res.json(listarOficios()));

app.post('/api/cotizar', (req, res) => res.json(cotizar(req.body)));

app.post('/api/agenda/proponer', (req, res) => res.json(proponerHorarios(req.body)));

app.post('/api/chat', async (req, res) => {
  const { sessionId, texto, oficioProfesional, nombreProfesional } = req.body;
  const respuesta = await conversar(sessionId || 'demo', texto, 'webchat', {
    oficioProfesional,
    nombreProfesional,
  });
  res.json({ respuesta });
});

const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => console.log(`MV Agendate IA (núcleo demo) escuchando en http://localhost:${PUERTO}`));
