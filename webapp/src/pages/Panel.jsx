import React, { useEffect, useState, useCallback } from 'react';
import { fetchAdmin, dinero } from '../api.js';

const ESTADOS = ['pendiente', 'confirmada', 'en_curso', 'completada', 'cancelada'];

export default function Panel() {
  const [datos, setDatos] = useState(null);
  const [retraso, setRetraso] = useState('');
  const [profesionales, setProfesionales] = useState([]);

  const cargar = useCallback(async () => {
    const [resp, profs] = await Promise.all([
      fetchAdmin('/api/panel'),
      fetch('/api/profesionales').then((r) => r.json()).catch(() => []),
    ]);
    setProfesionales(profs);
    if (resp.status !== 401) setDatos(await resp.json());
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 10000);
    return () => clearInterval(t);
  }, [cargar]);

  const cambiarEstado = async (id, estado) => {
    await fetchAdmin(`/api/citas/${id}/estado`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }),
    });
    cargar();
  };

  const chequearRetrasos = async () => {
    setRetraso('Revisando…');
    const r = await fetchAdmin('/api/agenda/chequear-retrasos', { method: 'POST' });
    const d = await r.json();
    setRetraso(d.avisos?.length ? `✅ ${d.avisos.length} aviso(s) de retraso enviados.` : 'Sin retrasos detectados por ahora.');
  };

  const hoy = datos?.hoy ?? [];
  const pendientes = datos?.cotizacionesPendientes ?? [];
  const multi = profesionales.length > 1;
  const nombreProf = (id) => profesionales.find((p) => p.id === id)?.nombre || '—';

  const [ajustes, setAjustes] = useState({});
  const [avisoCot, setAvisoCot] = useState('');
  const resolverCotizacion = async (cot, aprobar) => {
    const total = Number(ajustes[cot.id] ?? cot.sugerido?.total);
    const r = await fetchAdmin(`/api/cotizaciones/${cot.id}/resolver`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aprobar, total }),
    });
    const d = await r.json();
    if (!d.ok) { setAvisoCot(`⚠️ ${d.error || 'No se pudo resolver.'}`); return; }
    setAvisoCot(aprobar
      ? `✅ Precio confirmado (${cot.sugerido?.simbolo || '$'} ${d.cotizacion.totalAprobado})${cot.canal === 'whatsapp' && cot.telefono ? ' — el cliente ya recibió el aviso por WhatsApp.' : ' — el asistente se lo informa al cliente en cuanto retome la charla.'}`
      : 'Cotización rechazada: el asistente le dirá al cliente que lo contactás directamente.');
    cargar();
  };

  return (
    <>
      <div className="mv-pagehead">
        <div><div className="mv-crumb">Espacio de trabajo</div><h1>🗓️ Panel del día</h1></div>
      </div>
      <div className="mv-content">
        <div className="kpis">
          <div className="kpi"><div className="n">{datos ? hoy.length : '–'}</div><div className="l">Citas de hoy</div></div>
          <div className="kpi"><div className="n">{datos ? hoy.filter((c) => c.estado === 'en_curso').length : '–'}</div><div className="l">En curso</div></div>
          <div className="kpi"><div className="n">{datos ? datos.demo.total : '–'}</div><div className="l">Visitas a la demo</div></div>
        </div>
        <div className="card" style={{ marginBottom: 16, borderLeft: pendientes.length ? '4px solid var(--verde, #5cb531)' : undefined }}>
          <h2 className="mv-h">💬 Cotizaciones por aprobar {pendientes.length > 0 && <span style={{ color: '#5cb531' }}>({pendientes.length})</span>}</h2>
          <p style={{ fontSize: '.88rem', color: 'var(--muted)', margin: '0 0 10px' }}>
            El asistente nunca le dice un precio al cliente sin tu OK: acá aprobás cada cotización tal cual
            (o ajustás el monto) y recién ahí se le confirma. Si la charla fue por WhatsApp, el cliente recibe el precio al instante.
          </p>
          {pendientes.length === 0 ? (
            <div className="mv-empty">No hay cotizaciones esperando tu aprobación.</div>
          ) : (
            <div className="mv-tablewrap">
              <table className="mv-table">
                <thead>
                  <tr><th>Trabajo</th><th>Cliente</th><th>Canal</th><th>Sugerido</th><th>Precio a confirmar</th><th></th></tr>
                </thead>
                <tbody>
                  {pendientes.map((cot) => (
                    <tr key={cot.id}>
                      <td>{cot.trabajoNombre}</td>
                      <td>{cot.clienteNombre || cot.telefono || '—'}</td>
                      <td>{cot.canal}</td>
                      <td>{cot.sugerido?.simbolo || '$'} {cot.sugerido?.total ?? '—'} {cot.sugerido?.moneda || ''}</td>
                      <td>
                        <input
                          type="number" min="1" style={{ width: 110 }}
                          value={ajustes[cot.id] ?? cot.sugerido?.total ?? ''}
                          onChange={(e) => setAjustes({ ...ajustes, [cot.id]: e.target.value })}
                        />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn cel" onClick={() => resolverCotizacion(cot, true)}>Aprobar</button>{' '}
                        <button className="btn ghost" onClick={() => resolverCotizacion(cot, false)}>Rechazar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {avisoCot && <div style={{ fontSize: '.85rem', marginTop: 8, color: '#44535f' }}>{avisoCot}</div>}
        </div>
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 className="mv-h">⏰ Aviso automático de retrasos</h2>
          <p style={{ fontSize: '.88rem', color: 'var(--muted)', margin: '0 0 10px' }}>
            Si marcás un trabajo "en curso" y se estima que vas a llegar 30+ min tarde a la siguiente cita,
            se le avisa solo por WhatsApp al próximo cliente. En el servidor local esto corre cada 5 min; podés forzarlo ahora:
          </p>
          <button className="btn cel" onClick={chequearRetrasos}>Revisar retrasos ahora</button>
          {retraso && <div style={{ fontSize: '.85rem', marginTop: 8, color: '#44535f' }}>{retraso}</div>}
        </div>
        <div className="card">
          <h2 className="mv-h">🗓️ Agenda de hoy</h2>
          <div className="mv-tablewrap">
            {hoy.length === 0 ? (
              <div className="mv-empty">Sin citas para hoy.</div>
            ) : (
              <table className="mv-table">
                <thead>
                  <tr>
                    <th>Hora</th><th>Cliente</th><th>Trabajo</th>
                    {multi && <th>Profesional</th>}
                    <th>Dirección</th><th>Estado</th><th>Presupuesto</th>
                  </tr>
                </thead>
                <tbody>
                  {hoy.map((c) => (
                    <tr key={c.id}>
                      <td>{c.inicio}-{c.fin}</td>
                      <td>{c.clienteNombre}</td>
                      <td>{c.trabajoNombre}</td>
                      {multi && <td>{nombreProf(c.profesionalId)}</td>}
                      <td>{c.direccion}</td>
                      <td>
                        <select value={c.estado} onChange={(e) => cambiarEstado(c.id, e.target.value)}>
                          {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>
                      </td>
                      <td>{c.cotizacion?.total ? dinero(c.cotizacion.total) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
