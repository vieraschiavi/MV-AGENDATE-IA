import React, { useCallback, useEffect, useState } from 'react';
import { fetchAdmin, dinero } from '../api.js';

// Panel del VENDEDOR: todas las cuentas SaaS registradas, con sus métricas y
// el control manual de estado (además del automático del webhook de MercadoPago).
// Solo accesible con la clave de administración global — no aparece cuando hay
// una sesión de cuenta iniciada.
const ETIQUETA = {
  trial: ['Prueba gratis', '#b45309', '#fef3c7'],
  activa: ['Suscripción activa', '#166534', '#dcfce7'],
  suspendida: ['Suspendida', '#991b1b', '#fee2e2'],
};

export default function CuentasAdmin() {
  const [lista, setLista] = useState(null);
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    const r = await fetchAdmin('/api/admin/cuentas');
    if (r.ok) setLista(await r.json());
    else setAviso('Necesitás la clave de administración para ver las cuentas.');
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarEstado = async (c, estado) => {
    const r = await fetchAdmin(`/api/admin/cuentas/${c.id}/estado`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    const d = await r.json();
    setAviso(d.ok ? `✅ ${c.email} → ${estado}.` : `⚠️ ${d.error || 'No se pudo cambiar.'}`);
    cargar();
  };

  const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-UY') : '—');
  const activas = lista?.filter((c) => c.estado === 'activa').length ?? 0;
  const trials = lista?.filter((c) => c.estado === 'trial' && !c.trialVencido).length ?? 0;
  const mrr = activas * 15;

  return (
    <>
      <div className="mv-pagehead">
        <div><div className="mv-crumb">Vendedor</div><h1>🏢 Cuentas SaaS</h1></div>
      </div>
      <div className="mv-content">
        <div className="kpis">
          <div className="kpi"><div className="n">{lista ? lista.length : '–'}</div><div className="l">Cuentas registradas</div></div>
          <div className="kpi"><div className="n">{lista ? activas : '–'}</div><div className="l">Suscripciones activas</div></div>
          <div className="kpi"><div className="n">{lista ? trials : '–'}</div><div className="l">En prueba gratis</div></div>
          <div className="kpi"><div className="n">{lista ? `USD ${mrr}` : '–'}</div><div className="l">MRR (15 × activas)</div></div>
        </div>
        <div className="card">
          <h2 className="mv-h">Cuentas registradas</h2>
          <p style={{ fontSize: '.88rem', color: 'var(--muted)', margin: '0 0 10px' }}>
            El estado se actualiza solo con el webhook de MercadoPago (paga → activa, cancela → suspendida).
            Desde acá podés forzarlo a mano — por ejemplo, activar a alguien que pagó por transferencia.
          </p>
          <div className="mv-tablewrap">
            {!lista || lista.length === 0 ? (
              <div className="mv-empty">{lista ? 'Todavía no hay cuentas registradas.' : 'Cargando…'}</div>
            ) : (
              <table className="mv-table">
                <thead>
                  <tr>
                    <th>Cuenta</th><th>Estado</th><th>Trial hasta</th><th>Alta</th>
                    <th>Clientes</th><th>Citas</th><th>Cotiz. pend.</th><th>Facturado</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) => {
                    const [label, color, fondo] = ETIQUETA[c.estado] || [c.estado, '#334155', '#e2e8f0'];
                    return (
                      <tr key={c.id}>
                        <td><strong>{c.nombre || '—'}</strong><br /><span style={{ color: 'var(--muted)', fontSize: '.82rem' }}>{c.email}</span></td>
                        <td>
                          <span style={{ background: fondo, color, borderRadius: 999, padding: '2px 10px', fontSize: '.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {label}{c.trialVencido ? ' (vencida)' : ''}
                          </span>
                        </td>
                        <td>{c.estado === 'trial' ? fecha(c.trialHasta) : '—'}</td>
                        <td>{fecha(c.creado)}</td>
                        <td>{c.clientes}</td>
                        <td>{c.citas}</td>
                        <td>{c.cotizacionesPendientes}</td>
                        <td>{c.facturado ? dinero(c.facturado) : '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {c.estado !== 'activa' && <button className="btn cel" onClick={() => cambiarEstado(c, 'activa')}>Activar</button>}{' '}
                          {c.estado !== 'suspendida' && <button className="btn ghost" onClick={() => cambiarEstado(c, 'suspendida')}>Suspender</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {aviso && <div style={{ fontSize: '.85rem', marginTop: 8, color: '#44535f' }}>{aviso}</div>}
        </div>
      </div>
    </>
  );
}
