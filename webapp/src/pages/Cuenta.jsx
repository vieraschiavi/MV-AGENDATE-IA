// © 2026 Martín Viera. Todos los derechos reservados.

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cuentaSesion, guardarSesion, cerrarSesion, fetchAdmin } from '../api.js';
import { t } from '../i18n.js';

// Tarjeta de créditos de IA: saldo, consumo semanal y recarga por MercadoPago
// (los packs grandes traen bonificación de saldo extra).
function Creditos() {
  const [c, setC] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { fetchAdmin('/api/creditos').then((r) => r.json()).then(setC).catch(() => {}); }, []);
  if (!c || !c.habilitado) return null;
  const recargar = async (monto) => {
    setMsg(t('Conectando con MercadoPago…'));
    const r = await fetchAdmin('/api/creditos/recargar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monto }) });
    const d = await r.json();
    if (d.ok && d.init_point) { window.location.href = d.init_point; return; }
    setMsg(d.error || t('No se pudo iniciar la recarga.'));
  };
  const bajo = c.saldo <= 1;
  // Compatibilidad: packs viejos eran números pelados; ahora traen bonificación.
  const packs = (c.packs || []).map((p) => (typeof p === 'number' ? { monto: p, bonoPct: 0 } : p));
  return (
    <div className="card" style={{ maxWidth: 520, marginTop: 16, borderLeft: bajo ? '4px solid #e3a72f' : undefined }}>
      <h2 className="mv-h">🤖 {t('Créditos de IA')}</h2>
      <p style={{ margin: '0 0 4px' }}>{t('Saldo:')} <strong style={{ color: bajo ? '#b45309' : '#166534' }}>US$ {c.saldo.toFixed(2)}</strong></p>
      {c.semana && (
        <p style={{ fontSize: '.83rem', color: 'var(--muted)', margin: '0 0 4px' }}>
          📊 {t('Esta semana:')} <strong>{c.semana.llamadas}</strong> {t('consultas con IA')} · US$ {c.semana.usd.toFixed(2)}
        </p>
      )}
      {c.bonificado > 0 && (
        <p style={{ fontSize: '.83rem', color: '#166534', margin: '0 0 4px' }}>🎁 {t('Bonificado acumulado:')} US$ {c.bonificado.toFixed(2)}</p>
      )}
      <p style={{ fontSize: '.85rem', color: 'var(--muted)', margin: '6px 0 14px' }}>
        {t('Con esto funciona el chatbot y el ChatVoice con IA. Cuando se agota, el asistente sigue respondiendo con lógica básica hasta que recargues.')}{bajo ? t(' Te queda poco saldo.') : ''}
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {packs.map((p) => (
          <button key={p.monto} className="btn cel" onClick={() => recargar(p.monto)} style={{ position: 'relative', marginTop: 6 }}>
            {t('Recargar US$')} {p.monto}
            {p.bonoPct > 0 && (
              <span style={{
                position: 'absolute', top: -10, right: -6, background: '#e3a72f', color: '#241a05',
                fontSize: '.62rem', fontWeight: 800, borderRadius: 999, padding: '2px 7px', whiteSpace: 'nowrap',
              }}>+{Math.round(p.bonoPct * 100)}% {t('gratis')}</span>
            )}
          </button>
        ))}
      </div>
      {msg && <div style={{ fontSize: '.85rem', marginTop: 8, color: '#44535f' }}>{msg}</div>}
    </div>
  );
}

// Cuenta online (modo SaaS): registro con 14 días de prueba gratis y login.
// Con sesión iniciada, agenda/clientes/dashboards pasan a operar sobre los
// datos privados de la cuenta (aislados de cualquier otra).
export default function Cuenta() {
  const nav = useNavigate();
  const cuenta = cuentaSesion();
  const [modo, setModo] = useState('login'); // login | registro
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const r = await fetch(`/api/auth/${modo === 'registro' ? 'registro' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modo === 'registro' ? { email, password, nombre } : { email, password }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || t('No se pudo iniciar sesión.')); return; }
      guardarSesion(d.token, d.cuenta);
      nav('/panel');
      window.location.reload(); // recarga para que todo el workspace lea la cuenta nueva
    } catch {
      setError(t('Error de conexión. Probá de nuevo.'));
    } finally {
      setCargando(false);
    }
  };

  const salir = () => { cerrarSesion(); window.location.reload(); };

  const estiloLabel = { display: 'grid', gap: 4, fontSize: '.86rem', color: 'var(--muted)' };

  return (
    <>
      <div className="mv-pagehead">
        <div><div className="mv-crumb">{t('Espacio de trabajo')}</div><h1>👤 {t('Cuenta online')}</h1></div>
      </div>
      <div className="mv-content">
        {cuenta ? (
          <div className="card" style={{ maxWidth: 520 }}>
            <h2 className="mv-h">{t('Mi cuenta')}</h2>
            <p style={{ margin: '0 0 4px' }}><strong>{cuenta.nombre || cuenta.email}</strong></p>
            <p style={{ margin: '0 0 10px', color: 'var(--muted)' }}>{cuenta.email}</p>
            <p style={{ margin: '0 0 14px' }}>
              {t('Estado:')}{' '}
              <strong>
                {cuenta.estado === 'trial'
                  ? `${t('Prueba gratis')} (${Math.max(0, Math.ceil((new Date(cuenta.trialHasta) - Date.now()) / 86400000))} ${t('días restantes')})`
                  : cuenta.estado === 'activa' ? t('Suscripción activa') : cuenta.estado}
              </strong>
            </p>
            {cuenta.estado === 'trial' && (
              <p style={{ margin: '0 0 14px' }}>
                <a className="btn cel" href="/comprar.html?plan=saas">{t('Activar suscripción (USD 15/mes)')}</a>
              </p>
            )}
            <button className="btn sec" onClick={salir}>{t('Cerrar sesión')}</button>
          </div>
        ) : null}
        {cuenta && <Creditos />}
        {!cuenta && (
          <div className="card" style={{ maxWidth: 460 }}>
            <h2 className="mv-h">{t('Usá MV desde el navegador, sin instalar nada')}</h2>
            <p style={{ fontSize: '.88rem', color: 'var(--muted)', margin: '0 0 12px' }}>
              {t('14 días de prueba gratis, después USD 15/mes por MercadoPago. Tus datos y tu configuración (profesión, país, precios, horarios, equipo, canales) quedan privados y aislados, disponibles desde cualquier dispositivo.')}
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button className={`btn ${modo === 'login' ? '' : 'sec'}`} onClick={() => setModo('login')} type="button">{t('Iniciar sesión')}</button>
              <button className={`btn ${modo === 'registro' ? '' : 'sec'}`} onClick={() => setModo('registro')} type="button">{t('Crear cuenta')}</button>
            </div>
            <form onSubmit={enviar} style={{ display: 'grid', gap: 10 }}>
              {modo === 'registro' && (
                <label style={estiloLabel}>{t('Nombre o empresa')}
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t('Ej: Estudio Jurídico Pérez')} />
                </label>
              )}
              <label style={estiloLabel}>Email
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
              </label>
              <label style={estiloLabel}>{t('Contraseña')} {modo === 'registro' ? t('(mínimo 8 caracteres)') : ''}
                <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              {error && <p style={{ color: '#dc2626', margin: 0, fontSize: '.86rem' }}>{error}</p>}
              <button className="btn" disabled={cargando}>
                {cargando ? t('Un momento…') : modo === 'registro' ? t('Crear cuenta (14 días gratis)') : t('Entrar')}
              </button>
            </form>
            <p style={{ marginTop: 12, fontSize: '.8rem', color: 'var(--muted)' }}>
              {t('¿Preferís tenerlo instalado en tu PC o Android con pago único? Esta pantalla es solo para el modo online — la versión descargable no necesita cuenta.')}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
