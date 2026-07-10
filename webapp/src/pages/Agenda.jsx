import React, { useEffect, useState, useCallback } from 'react';
import { fetchAdmin, getJSON, dinero } from '../api.js';
import { t } from '../i18n.js';

const ESTADOS = ['pendiente', 'confirmada', 'en_curso', 'completada', 'cancelada'];

const FORM_VACIO = {
  clienteNombre: '', telefono: '', oficio: '', trabajo: '', profesionalId: '',
  fecha: '', inicio: '', fin: '', distanciaKm: 5, direccion: '', receptor: '',
};

export default function Agenda() {
  const [citas, setCitas] = useState([]);
  const [oficios, setOficios] = useState([]);
  const [profesionales, setProfesionales] = useState([]);
  const [vista, setVista] = useState('tabla');
  const [filtro, setFiltro] = useState({ fecha: '', oficio: '', estado: '', profesionalId: '' });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    getJSON('/api/oficios').then((o) => {
      setOficios(o);
      setForm((f) => ({ ...f, oficio: o[0]?.clave || '', trabajo: o[0]?.trabajos[0]?.clave || '' }));
    });
    getJSON('/api/profesionales').then(setProfesionales).catch(() => {});
  }, []);

  const cargar = useCallback(async () => {
    const q = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v));
    setCitas(await getJSON('/api/citas?' + q));
  }, [filtro]);
  useEffect(() => { cargar(); }, [cargar]);

  // Presupuesto estimado en vivo dentro del modal de nueva cita
  useEffect(() => {
    if (!modal || !form.oficio || !form.trabajo) return;
    let vivo = true;
    fetch('/api/cotizar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oficio: form.oficio, trabajo: form.trabajo, distanciaKm: Number(form.distanciaKm) || 0 }),
    }).then((r) => r.json()).then((r) => {
      if (vivo) setPreview(r.total != null ? `${t('Presupuesto estimado:')} ${dinero(r.total)} (${r.duracion_estimada_min} min)` : '');
    });
    return () => { vivo = false; };
  }, [modal, form.oficio, form.trabajo, form.distanciaKm]);

  const cambiarEstado = async (id, est) => {
    if (!est) return;
    await fetchAdmin(`/api/citas/${id}/estado`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: est }),
    });
    cargar();
  };

  const guardar = async () => {
    if (!form.clienteNombre || !form.fecha || !form.inicio) return alert(t('Completá al menos cliente, fecha y hora.'));
    const cot = await fetch('/api/cotizar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oficio: form.oficio, trabajo: form.trabajo, distanciaKm: Number(form.distanciaKm) || 0 }),
    }).then((r) => r.json());
    const of = oficios.find((o) => o.clave === form.oficio);
    const trabajo = of?.trabajos.find((t) => t.clave === form.trabajo);
    const body = {
      clienteNombre: form.clienteNombre, telefono: form.telefono,
      profesionalId: form.profesionalId || undefined,
      oficio: form.oficio, oficioNombre: of?.nombre, trabajo: form.trabajo, trabajoNombre: trabajo?.nombre,
      fecha: form.fecha, inicio: form.inicio, fin: form.fin || form.inicio,
      direccion: form.direccion, receptor: form.receptor || null,
      cotizacion: cot.total != null ? { ...cot.desglose, total: cot.total } : null,
    };
    const r = await fetchAdmin('/api/citas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then((x) => x.json());
    if (r.ok) { setModal(false); setForm({ ...FORM_VACIO, oficio: form.oficio, trabajo: form.trabajo }); cargar(); }
    else alert(r.error || t('Error'));
  };

  const of = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const oficioSel = oficios.find((o) => o.clave === form.oficio);
  const multi = profesionales.length > 1;
  const nombreProf = (id) => profesionales.find((p) => p.id === id)?.nombre || '—';
  const ficha = (id) => window.open(`/api/citas/${id}/ficha`, '_blank');

  return (
    <>
      <div className="mv-pagehead">
        <div><div className="mv-crumb">{t('Espacio de trabajo')}</div><h1>📅 {t('Agenda')}</h1></div>
        <div className="mv-views" style={{ marginLeft: 'auto' }}>
          <button className={vista === 'tabla' ? 'on' : ''} onClick={() => setVista('tabla')}>☰ {t('Tabla')}</button>
          <button className={vista === 'tablero' ? 'on' : ''} onClick={() => setVista('tablero')}>▦ {t('Tablero')}</button>
        </div>
      </div>
      <div className="mv-content">
        <div className="mv-pagehead" style={{ background: 'none', border: 0, padding: '0 0 14px', flexWrap: 'wrap' }}>
          <input type="date" style={{ width: 'auto' }} value={filtro.fecha} onChange={(e) => setFiltro({ ...filtro, fecha: e.target.value })} />
          <select style={{ width: 'auto' }} value={filtro.oficio} onChange={(e) => setFiltro({ ...filtro, oficio: e.target.value })}>
            <option value="">{t('Oficio')}</option>
            {oficios.map((o) => <option key={o.clave} value={o.clave}>{o.nombre}</option>)}
          </select>
          <select style={{ width: 'auto' }} value={filtro.estado} onChange={(e) => setFiltro({ ...filtro, estado: e.target.value })}>
            <option value="">{t('Estado')}</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{t(e)}</option>)}
          </select>
          {multi && (
            <select style={{ width: 'auto' }} value={filtro.profesionalId} onChange={(e) => setFiltro({ ...filtro, profesionalId: e.target.value })}>
              <option value="">{t('Profesional')}</option>
              {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          )}
          <button className="btn cel" onClick={() => setModal(true)}>{t('+ Nueva cita')}</button>
          <a className="btn sec" href="/api/agenda.csv">⬇ CSV</a>
          <a className="btn sec" href="/api/agenda.xls">⬇ Excel</a>
        </div>

        {vista === 'tabla' ? (
          <div className="mv-tablewrap">
            {citas.length === 0 ? <div className="mv-empty">{t('Sin citas con ese filtro.')}</div> : (
              <table className="mv-table">
                <thead>
                  <tr>
                    <th>{t('Cliente')}</th><th>{t('Trabajo')}</th><th>{t('Oficio')}</th>
                    {multi && <th>{t('Profesional')}</th>}
                    <th>{t('Fecha')}</th><th>{t('Hora')}</th><th>{t('Dirección')}</th><th>{t('Precio')}</th><th>{t('Estado')}</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {citas.map((c) => (
                    <tr key={c.id} className="row" onClick={() => ficha(c.id)}>
                      <td>{c.clienteNombre}</td><td>{c.trabajoNombre}</td><td>{c.oficioNombre}</td>
                      {multi && <td>{nombreProf(c.profesionalId)}</td>}
                      <td>{c.fecha}</td><td>{c.inicio}-{c.fin}</td>
                      <td>{c.direccion || '—'}{c.receptor ? ` ${t('· atiende')} ${c.receptor}` : ''}</td>
                      <td><strong style={{ color: 'var(--cel)' }}>{c.cotizacion?.total ? dinero(c.cotizacion.total) : '—'}</strong></td>
                      <td><span className={`pill ${c.estado}`}><i />{t(c.estado)}</span></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select value="" onChange={(e) => cambiarEstado(c.id, e.target.value)} style={{ fontSize: '.8rem', padding: 4 }}>
                          <option value="">{t('Cambiar estado…')}</option>
                          {ESTADOS.map((e) => <option key={e} value={e}>{t(e)}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="mv-board">
            {ESTADOS.map((e) => {
              const cs = citas.filter((c) => c.estado === e);
              return (
                <div className="mv-board-col" key={e}>
                  <h3><span className={`pill ${e}`}><i />{t(e)}</span><span className="cnt">{cs.length}</span></h3>
                  {cs.map((c) => (
                    <div className="mv-board-card" key={c.id} onClick={() => ficha(c.id)}>
                      <div className="t">{c.clienteNombre}</div>
                      <div className="m">{c.trabajoNombre} · {c.fecha} {c.inicio}{multi ? ` · ${nombreProf(c.profesionalId)}` : ''}</div>
                      <div className="m">📍 {c.direccion || '—'}</div>
                      <div className="precio">{c.cotizacion?.total ? dinero(c.cotizacion.total) : '—'}</div>
                    </div>
                  ))}
                  {cs.length === 0 && <div className="mv-empty" style={{ padding: 8 }}>{t('Vacío')}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <div className="modal" style={{ display: 'grid' }}>
          <div className="box">
            <h3>{t('Nueva cita')}</h3>
            <div className="form2">
              <div><label>{t('Cliente')}</label><input value={form.clienteNombre} onChange={(e) => of('clienteNombre', e.target.value)} /></div>
              <div><label>{t('Teléfono')}</label><input value={form.telefono} onChange={(e) => of('telefono', e.target.value)} /></div>
              <div>
                <label>{t('Oficio')}</label>
                <select value={form.oficio} onChange={(e) => { const o = oficios.find((x) => x.clave === e.target.value); setForm((f) => ({ ...f, oficio: e.target.value, trabajo: o?.trabajos[0]?.clave || '' })); }}>
                  {oficios.map((o) => <option key={o.clave} value={o.clave}>{o.nombre}</option>)}
                </select>
              </div>
              <div>
                <label>{t('Trabajo')}</label>
                <select value={form.trabajo} onChange={(e) => of('trabajo', e.target.value)}>
                  {(oficioSel?.trabajos || []).map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
                </select>
              </div>
              {multi && (
                <div>
                  <label>{t('Profesional')}</label>
                  <select value={form.profesionalId} onChange={(e) => of('profesionalId', e.target.value)}>
                    <option value="">{t('(el primero)')}</option>
                    {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              )}
              <div><label>{t('Fecha')}</label><input type="date" value={form.fecha} onChange={(e) => of('fecha', e.target.value)} /></div>
              <div><label>{t('Hora inicio')}</label><input type="time" value={form.inicio} onChange={(e) => of('inicio', e.target.value)} /></div>
              <div><label>{t('Hora fin')}</label><input type="time" value={form.fin} onChange={(e) => of('fin', e.target.value)} /></div>
              <div><label>{t('Distancia estimada (km)')}</label><input type="number" value={form.distanciaKm} onChange={(e) => of('distanciaKm', e.target.value)} /></div>
            </div>
            <label>{t('Dirección')}</label><input style={{ width: '100%' }} value={form.direccion} onChange={(e) => of('direccion', e.target.value)} />
            <label>{t('Quién atiende (si no es el titular)')}</label><input style={{ width: '100%' }} value={form.receptor} onChange={(e) => of('receptor', e.target.value)} />
            {preview && <div style={{ marginTop: 10, fontSize: '.85rem', color: 'var(--muted)' }}>{preview}</div>}
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn cel" onClick={guardar}>{t('Guardar cita')}</button>
              <button className="btn sec" onClick={() => setModal(false)}>{t('Cancelar')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
