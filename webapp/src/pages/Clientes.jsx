import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchAdmin, getJSON, dinero } from '../api.js';
import { t } from '../i18n.js';

const FORM_VACIO = { nombre: '', telefono: '', email: '', direccion: '', receptorHabitual: '', notas: '' };

export default function Clientes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [clientes, setClientes] = useState([]);
  const [profesionales, setProfesionales] = useState([]);
  const [citas, setCitas] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [dir, setDir] = useState('');
  const [avisoDir, setAvisoDir] = useState(null);

  const cargar = useCallback(async () => {
    setClientes(await getJSON('/api/clientes'));
    setProfesionales(await getJSON('/api/profesionales').catch(() => []));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const cliente = id ? clientes.find((c) => c.id === id) : null;

  useEffect(() => {
    setAvisoDir(null);
    if (cliente) {
      setDir(cliente.direccion || '');
      getJSON(`/api/citas?clienteId=${cliente.id}`).then(setCitas);
    }
  }, [cliente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmarDireccion = async () => {
    const r = await fetch(`/api/cliente/${id}/confirmar-direccion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direccionInformada: dir.trim() }),
    }).then((x) => x.json());
    setAvisoDir(r.coincide === false ? 'warn' : 'ok');
    cargar();
  };

  const cambiarProfesional = async (profesionalId) => {
    await fetchAdmin(`/api/cliente/${id}/profesional`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profesionalId }),
    });
    cargar();
  };

  const guardarCliente = async () => {
    if (!form.nombre) return alert(t('Poné al menos el nombre.'));
    const r = await fetchAdmin('/api/cliente', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    }).then((x) => x.json());
    if (r.ok) { setModal(false); setForm(FORM_VACIO); await cargar(); navigate(`/clientes/${r.cliente.id}`); }
    else alert(r.error || t('Error'));
  };

  const multi = profesionales.length > 1;
  const of = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  return (
    <>
      <div className="mv-pagehead">
        <div>
          <div className="mv-crumb">
            {cliente ? <><a href="#/clientes" onClick={(e) => { e.preventDefault(); navigate('/clientes'); }}>{t('Clientes')}</a> / {cliente.nombre || cliente.id}</> : t('Espacio de trabajo')}
          </div>
          <h1>{cliente ? (cliente.nombre || cliente.id) : <>👥 {t('Clientes')}</>}</h1>
        </div>
        <button className="btn cel" style={{ marginLeft: 'auto' }} onClick={() => setModal(true)}>{t('+ Nuevo cliente')}</button>
      </div>
      <div className="mv-content">
        {!cliente ? (
          <div className="mv-tablewrap">
            {clientes.length === 0 ? <div className="mv-empty">{t('Sin fichas aún.')}</div> : (
              <table className="mv-table">
                <thead><tr><th>{t('Nombre')}</th><th>{t('Contacto')}</th><th>{t('Dirección')}</th><th>{t('Receptor habitual')}</th></tr></thead>
                <tbody>
                  {clientes.map((c) => (
                    <tr key={c.id} className="row" onClick={() => navigate(`/clientes/${c.id}`)}>
                      <td><strong>{c.nombre || c.id}</strong></td>
                      <td>{c.telefono || c.email || '—'}</td>
                      <td>{c.direccion || t('sin dirección cargada')}</td>
                      <td>{c.receptorHabitual || '—'}</td>
                    </tr>
                  ))}
                  <tr className="addrow" onClick={() => setModal(true)}><td colSpan={4}>{t('+ Nuevo cliente')}</td></tr>
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="mv-pageview card">
            <div className="icon-title"><div className="av">👤</div><h2>{cliente.nombre || cliente.id}</h2></div>
            <div className="mv-prop">
              <div className="k">{t('Teléfono')}</div><div className="v">{cliente.telefono || '—'}</div>
              <div className="k">Email</div><div className="v">{cliente.email || '—'}</div>
              <div className="k">{t('Receptor habitual')}</div><div className="v">{cliente.receptorHabitual || '—'}</div>
              <div className="k">{t('Notas')}</div><div className="v">{cliente.notas || '—'}</div>
              {multi && (
                <>
                  <div className="k">{t('Atendido por')}</div>
                  <div className="v">
                    <select value={cliente.profesionalId || ''} onChange={(e) => cambiarProfesional(e.target.value)}>
                      <option value="">{t('Sin asignar')}</option>
                      {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div className="k">{t('Dirección')}</div>
              <div className="v">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input style={{ flex: 1 }} value={dir} onChange={(e) => setDir(e.target.value)} />
                  <button className="btn sec" onClick={confirmarDireccion}>{t('Confirmar')}</button>
                </div>
                {avisoDir === 'ok' && <div className="aviso ok">✅ {t('Dirección confirmada.')}</div>}
                {avisoDir === 'warn' && <div className="aviso warn">{t('Dirección actualizada (no coincidía con la base).')}</div>}
              </div>
            </div>
            <h2 className="mv-h" style={{ marginTop: 20 }}>{t('Trabajos')}</h2>
            <div className="mv-tablewrap">
              {citas.length === 0 ? <div className="mv-empty">{t('Sin trabajos registrados todavía.')}</div> : (
                <table className="mv-table">
                  <thead><tr><th>{t('Trabajo')}</th><th>{t('Fecha')}</th><th>{t('Precio')}</th><th>{t('Estado')}</th><th></th></tr></thead>
                  <tbody>
                    {citas.map((ci) => (
                      <tr key={ci.id} className="row" onClick={() => window.open(`/api/citas/${ci.id}/ficha`, '_blank')}>
                        <td>{ci.trabajoNombre}</td>
                        <td>{ci.fecha} {ci.inicio}</td>
                        <td><strong style={{ color: 'var(--cel)' }}>{ci.cotizacion?.total ? dinero(ci.cotizacion.total) : '—'}</strong></td>
                        <td><span className={`pill ${ci.estado}`}><i />{t(ci.estado)}</span></td>
                        <td><a href={`/api/citas/${ci.id}/ficha`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{t('Ver ficha')}</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal" style={{ display: 'grid' }}>
          <div className="box">
            <h3>{t('➕ Nueva ficha de cliente')}</h3>
            <div className="form2">
              <div><label>{t('Nombre')}</label><input value={form.nombre} onChange={(e) => of('nombre', e.target.value)} /></div>
              <div><label>{t('Teléfono')}</label><input value={form.telefono} onChange={(e) => of('telefono', e.target.value)} /></div>
              <div><label>Email</label><input value={form.email} onChange={(e) => of('email', e.target.value)} /></div>
              <div><label>{t('Quién suele atender (si no es el titular)')}</label><input value={form.receptorHabitual} onChange={(e) => of('receptorHabitual', e.target.value)} /></div>
            </div>
            <label>{t('Dirección de la base')}</label><input style={{ width: '100%' }} value={form.direccion} onChange={(e) => of('direccion', e.target.value)} />
            <label>{t('Notas')}</label><textarea style={{ width: '100%', minHeight: 52 }} value={form.notas} onChange={(e) => of('notas', e.target.value)} />
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn cel" onClick={guardarCliente}>{t('Guardar ficha')}</button>
              <button className="btn sec" onClick={() => setModal(false)}>{t('Cancelar')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
