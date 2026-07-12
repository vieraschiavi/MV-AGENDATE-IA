import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchAdmin, getJSON, cuentaSesion } from '../api.js';
import { t } from '../i18n.js';

// Wizard de primer uso: guía al profesional nuevo en 4 pasos —
// nombre+país → profesión → horarios → precios de mercado con IA (opcional).
// Se muestra una sola vez (localStorage) y solo si la config está "virgen"
// (sin nombre de profesional cargado). Todo se puede saltear: al cerrar,
// el programa queda usable igual y la config completa vive en /config.html.
const DIAS = [
  ['1', 'Lun'], ['2', 'Mar'], ['3', 'Mié'], ['4', 'Jue'], ['5', 'Vie'], ['6', 'Sáb'], ['0', 'Dom'],
];

export default function Onboarding() {
  const ruta = useLocation().pathname;
  const [visible, setVisible] = useState(false);
  const [paso, setPaso] = useState(1);
  const [paises, setPaises] = useState([]);
  const [oficios, setOficios] = useState([]);
  const [form, setForm] = useState({
    nombreProfesional: '', pais: 'uy', oficioProfesional: 'electricista',
    horarioInicio: '08:00', horarioFin: '19:00', almuerzoInicio: '12:30', almuerzoFin: '13:30',
    diasLibres: ['0'],
  });
  const [guardando, setGuardando] = useState(false);
  const [precios, setPrecios] = useState({ estado: '', detalle: '' });

  useEffect(() => {
    // "Forzado": /config.html → "Abrir el asistente guiado" lo reabre aunque
    // ya haya configuración cargada (para retocar los básicos con guía).
    const forzado = sessionStorage.getItem('mvAsistenteForzar') === '1';
    if (!forzado && localStorage.getItem('mvOnboardingListo')) return;
    fetchAdmin('/api/config').then(async (r) => {
      if (!r.ok) return;
      const cfg = await r.json();
      if (!forzado && cfg.nombreProfesional) return; // ya configurado: nunca molestar
      sessionStorage.removeItem('mvAsistenteForzar');
      const [ps, ofs] = await Promise.all([getJSON('/api/paises'), getJSON('/api/oficios')]);
      setPaises(ps);
      setOficios(ofs);
      // Precargamos lo que ya haya para que "reabrir" no borre nada.
      setForm((f) => ({
        ...f,
        nombreProfesional: cfg.nombreProfesional || f.nombreProfesional,
        pais: cfg.pais || f.pais,
        oficioProfesional: cfg.oficioProfesional || f.oficioProfesional,
        horarioInicio: cfg.horarioInicio || f.horarioInicio,
        horarioFin: cfg.horarioFin || f.horarioFin,
        almuerzoInicio: cfg.almuerzoInicio || f.almuerzoInicio,
        almuerzoFin: cfg.almuerzoFin || f.almuerzoFin,
        diasLibres: cfg.diasLibres ? String(cfg.diasLibres).split(',') : f.diasLibres,
      }));
      setVisible(true);
    }).catch(() => {});
  }, []);

  // Nunca tapar la pantalla de login/registro: ahí el usuario todavía no
  // tiene cuenta — el wizard lo recibe DESPUÉS, ya adentro del workspace.
  if (!visible || (ruta === '/cuenta' && !cuentaSesion())) return null;

  const cerrar = () => { localStorage.setItem('mvOnboardingListo', '1'); setVisible(false); };
  const upd = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const toggleDia = (d) => upd('diasLibres', form.diasLibres.includes(d)
    ? form.diasLibres.filter((x) => x !== d)
    : [...form.diasLibres, d]);

  // Paso 3 → guarda la config base (el país tiene que estar guardado ANTES de
  // sugerir precios, porque la IA investiga el mercado del país configurado).
  const guardarBase = async () => {
    setGuardando(true);
    const r = await fetchAdmin('/api/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombreProfesional: form.nombreProfesional.trim(),
        pais: form.pais, oficioProfesional: form.oficioProfesional,
        horarioInicio: form.horarioInicio, horarioFin: form.horarioFin,
        almuerzoInicio: form.almuerzoInicio, almuerzoFin: form.almuerzoFin,
        diasLibres: form.diasLibres.join(','),
      }),
    }).then((x) => x.json()).catch(() => ({}));
    setGuardando(false);
    if (r && !r.error) setPaso(4);
    else setPrecios({ estado: 'err', detalle: r.error || t('Error de conexión. Probá de nuevo.') });
  };

  // Paso 4 (opcional): investiga precios del mercado local y los aplica al catálogo.
  const sugerirYAplicar = async () => {
    setPrecios({ estado: 'cargando', detalle: t('🔎 Investigando precios de tu mercado con IA… (unos segundos)') });
    try {
      const d = await fetchAdmin('/api/precios/sugerir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oficio: form.oficioProfesional }),
      }).then((x) => x.json());
      if (!d.ok) { setPrecios({ estado: 'err', detalle: d.error || t('No se pudo investigar.') }); return; }
      // Clona el oficio con los precios sugeridos (mismo flujo que /config.html).
      const detalle = await getJSON(`/api/oficios/${form.oficioProfesional}`);
      const body = {
        clave: form.oficioProfesional, nombre: detalle.nombre, honorarios: !!detalle.honorarios,
        traslado_por_km: detalle.traslado_por_km, traslado_minimo: detalle.traslado_minimo,
        trabajos: Object.entries(detalle.trabajos).map(([clave, tr]) => {
          const sug = d.trabajos.find((x) => x.clave === clave);
          return {
            clave, nombre: tr.nombre, duracion_min: tr.duracion_min,
            mano_obra: sug ? sug.mano_obra : tr.mano_obra,
            materiales_base: sug ? sug.materiales_base : tr.materiales_base,
          };
        }),
      };
      const r = await fetchAdmin('/api/oficios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then((x) => x.json());
      setPrecios(r.ok
        ? { estado: 'ok', detalle: `✅ ${t('Listo: tu catálogo quedó con precios de mercado de')} ${d.pais} (${d.moneda}). ${t('Los afinás cuando quieras en Configuración → Precios.')}` }
        : { estado: 'err', detalle: r.error || t('No se pudo aplicar.') });
    } catch {
      setPrecios({ estado: 'err', detalle: t('Error de red.') });
    }
  };

  const S = { // estilos mínimos inline, coherentes con el workspace
    overlay: { position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,42,67,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 },
    box: { background: '#fff', borderRadius: 16, maxWidth: 560, width: '100%', padding: 24, maxHeight: '92vh', overflowY: 'auto' },
    label: { display: 'grid', gap: 4, fontSize: '.86rem', color: 'var(--muted, #5a6b7c)', marginBottom: 10 },
    fila: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
    pasos: { display: 'flex', gap: 6, margin: '2px 0 16px' },
    punto: (on) => ({ flex: 1, height: 6, borderRadius: 3, background: on ? 'var(--cel, #1f7ae0)' : '#e6ebf1' }),
    acciones: { display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  };

  return (
    <div style={S.overlay}>
      <div style={S.box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <img src="/logo-mv.svg" alt="MV" style={{ width: 40, height: 40, borderRadius: 10 }} />
          <div>
            <h2 style={{ margin: 0, color: '#0f2a43', fontSize: '1.15rem' }}>{t('¡Bienvenido a MV Agendate IA!')}</h2>
            <div style={{ fontSize: '.82rem', color: 'var(--muted, #5a6b7c)' }}>{t('En 4 pasos cortos dejamos tu asistente listo para cotizar y agendar.')}</div>
          </div>
        </div>
        <div style={S.pasos}>{[1, 2, 3, 4].map((n) => <span key={n} style={S.punto(paso >= n)} />)}</div>

        {paso === 1 && (
          <>
            <h3 style={{ margin: '0 0 10px', color: '#0f2a43' }}>1 · {t('Vos y tu país')}</h3>
            <label style={S.label}>{t('Tu nombre (así te presenta el asistente)')}
              <input value={form.nombreProfesional} onChange={(e) => upd('nombreProfesional', e.target.value)} placeholder={t('Ej: Marcelo Techera')} />
            </label>
            <label style={S.label}>{t('País (define moneda, idioma y precios de mercado)')}
              <select value={form.pais} onChange={(e) => upd('pais', e.target.value)}>
                {paises.map((p) => <option key={p.clave} value={p.clave}>{p.nombre} ({p.moneda})</option>)}
              </select>
            </label>
            <div style={S.acciones}>
              <button className="btn cel" disabled={!form.nombreProfesional.trim()} onClick={() => setPaso(2)}>{t('Siguiente →')}</button>
              <button className="btn sec" onClick={cerrar}>{t('Configurar después')}</button>
            </div>
          </>
        )}

        {paso === 2 && (
          <>
            <h3 style={{ margin: '0 0 10px', color: '#0f2a43' }}>2 · {t('Tu profesión u oficio')}</h3>
            <label style={S.label}>{t('Elegí la tuya — el catálogo de trabajos y precios se arma solo')}
              <select value={form.oficioProfesional} onChange={(e) => upd('oficioProfesional', e.target.value)}>
                {oficios.map((o) => <option key={o.clave} value={o.clave}>{o.nombre}</option>)}
              </select>
            </label>
            <p style={{ fontSize: '.8rem', color: 'var(--muted, #5a6b7c)' }}>
              {t('¿No está la tuya? Elegí la más parecida y después creá la propia en Configuración → Profesiones (1 minuto).')}
            </p>
            <div style={S.acciones}>
              <button className="btn cel" onClick={() => setPaso(3)}>{t('Siguiente →')}</button>
              <button className="btn sec" onClick={() => setPaso(1)}>{t('← Atrás')}</button>
            </div>
          </>
        )}

        {paso === 3 && (
          <>
            <h3 style={{ margin: '0 0 10px', color: '#0f2a43' }}>3 · {t('Tu jornada')}</h3>
            <div style={S.fila}>
              <label style={S.label}>{t('Empezás')}<input type="time" value={form.horarioInicio} onChange={(e) => upd('horarioInicio', e.target.value)} /></label>
              <label style={S.label}>{t('Terminás')}<input type="time" value={form.horarioFin} onChange={(e) => upd('horarioFin', e.target.value)} /></label>
              <label style={S.label}>{t('Almuerzo desde')}<input type="time" value={form.almuerzoInicio} onChange={(e) => upd('almuerzoInicio', e.target.value)} /></label>
              <label style={S.label}>{t('Almuerzo hasta')}<input type="time" value={form.almuerzoFin} onChange={(e) => upd('almuerzoFin', e.target.value)} /></label>
            </div>
            <div style={{ fontSize: '.86rem', color: 'var(--muted, #5a6b7c)', marginBottom: 6 }}>{t('Días libres (la agenda nunca ofrece turnos ahí):')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DIAS.map(([v, n]) => (
                <button key={v} type="button" onClick={() => toggleDia(v)}
                  className={form.diasLibres.includes(v) ? 'btn cel' : 'btn sec'}
                  style={{ padding: '6px 10px', fontSize: '.82rem' }}>{t(n)}</button>
              ))}
            </div>
            <div style={S.acciones}>
              <button className="btn cel" disabled={guardando} onClick={guardarBase}>{guardando ? t('Guardando…') : t('Guardar y seguir →')}</button>
              <button className="btn sec" onClick={() => setPaso(2)}>{t('← Atrás')}</button>
            </div>
            {precios.estado === 'err' && <div className="aviso warn" style={{ marginTop: 8 }}>{precios.detalle}</div>}
          </>
        )}

        {paso === 4 && (
          <>
            <h3 style={{ margin: '0 0 10px', color: '#0f2a43' }}>4 · {t('Precios de tu mercado (opcional)')}</h3>
            <p style={{ fontSize: '.86rem', color: 'var(--muted, #5a6b7c)' }}>
              {t('La IA investiga qué se cobra hoy en tu país por cada trabajo de tu profesión y deja tu catálogo con esos valores de referencia. Podés saltearlo y cargar los tuyos a mano.')}
            </p>
            <div style={S.acciones}>
              <button className="btn cel" disabled={precios.estado === 'cargando'} onClick={sugerirYAplicar}>
                {precios.estado === 'cargando' ? t('Investigando…') : t('🔎 Sugerir precios con IA')}
              </button>
              <button className="btn sec" onClick={cerrar}>{precios.estado === 'ok' ? t('¡Listo, a trabajar! →') : t('Saltear y terminar')}</button>
            </div>
            {precios.detalle && (
              <div style={{ marginTop: 10, fontSize: '.86rem', color: precios.estado === 'err' ? '#b45309' : '#166534' }}>{precios.detalle}</div>
            )}
            <p style={{ fontSize: '.78rem', color: 'var(--muted, #5a6b7c)', marginTop: 14 }}>
              {t('Después conectá tu WhatsApp y tu teléfono desde Configuración — el webchat de la demo ya funciona.')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
