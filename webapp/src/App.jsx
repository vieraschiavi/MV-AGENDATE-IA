import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Panel from './pages/Panel.jsx';
import Agenda from './pages/Agenda.jsx';
import Clientes from './pages/Clientes.jsx';
import Dashboards from './pages/Dashboards.jsx';
import Ayuda from './pages/Ayuda.jsx';
import Cuenta from './pages/Cuenta.jsx';
import CuentasAdmin from './pages/CuentasAdmin.jsx';
import CandadoPrueba from './pages/CandadoPrueba.jsx';
import Onboarding from './pages/Onboarding.jsx';
import ErrorBoundary from './pages/ErrorBoundary.jsx';
import { claveAdmin, cuentaSesion, fetchAdmin } from './api.js';
import { t, idioma, setIdioma } from './i18n.js';

// Pill de saldo de créditos de IA en la sidebar (solo cuentas SaaS con el
// modo créditos activo). Se refresca cada 30 s y "late" cuando el saldo baja.
function SaldoPill({ onIr }) {
  const [saldo, setSaldo] = useState(null);
  const [late, setLate] = useState(false);
  const prev = React.useRef(null);
  useEffect(() => {
    let vivo = true;
    const leer = () => fetchAdmin('/api/creditos').then((r) => r.json()).then((c) => {
      if (!vivo || !c?.habilitado || typeof c.saldo !== 'number') return;
      if (prev.current != null && c.saldo < prev.current) {
        setLate(true); setTimeout(() => vivo && setLate(false), 900);
      }
      prev.current = c.saldo;
      setSaldo(c.saldo);
    }).catch(() => {});
    leer();
    const timer = setInterval(leer, 30000);
    return () => { vivo = false; clearInterval(timer); };
  }, []);
  if (saldo == null) return null;
  const bajo = saldo <= 1;
  return (
    <button type="button" onClick={onIr} title={t('Créditos de IA')} style={{
      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px',
      border: '1px solid ' + (bajo ? '#e3a72f' : 'rgba(127,146,165,.3)'), borderRadius: 10,
      background: bajo ? 'rgba(227,167,47,.12)' : 'transparent', color: 'inherit', cursor: 'pointer',
      fontSize: '.82rem', fontWeight: 700, marginBottom: 6,
      transform: late ? 'scale(1.06)' : 'scale(1)', transition: 'transform .25s, background .25s',
    }}>
      <span>🤖</span>
      <span style={{ color: bajo ? '#b45309' : '#2ea043' }}>US$ {saldo.toFixed(2)}</span>
      <span style={{ marginLeft: 'auto', fontWeight: 500, opacity: .7 }}>{bajo ? t('Recargar →') : t('créditos IA')}</span>
    </button>
  );
}

const PAGINAS = [
  { to: '/panel', ico: '🗓️', label: 'Panel del día' },
  { to: '/agenda', ico: '📅', label: 'Agenda' },
  { to: '/clientes', ico: '👥', label: 'Clientes' },
  { to: '/dashboards', ico: '📊', label: 'Dashboards' },
  { to: '/ayuda', ico: '❓', label: 'Ayuda' },
];

export default function App() {
  const [abierto, setAbierto] = useState(false);
  const cerrar = () => setAbierto(false);
  const cuenta = cuentaSesion();
  const nav = useNavigate();
  const ruta = useLocation().pathname;

  // Portero amable: si el servidor exige autenticación (hosted con clave
  // admin) y no hay sesión ni clave cargada, invitamos a crear la cuenta en
  // vez de interrumpir con un prompt. En la copia local/descargable el
  // sondeo devuelve 200 y no pasa nada.
  useEffect(() => {
    if (cuenta || claveAdmin() || ruta === '/cuenta') return;
    fetch('/api/panel', { headers: { 'X-Admin-Key': '' } })
      .then((r) => { if (r.status === 401) nav('/cuenta', { replace: true }); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pedirClave = () => {
    const k = prompt(t('Clave de administración:'), claveAdmin());
    if (k == null) return;
    localStorage.setItem('mvAdminKey', k);
    window.location.reload(); // recarga para que todo el workspace use la clave
  };

  return (
    <>
      <CandadoPrueba />
      <Onboarding />
      <div className="mv-topbar-mobile">
        <button onClick={() => setAbierto(!abierto)} aria-label={t('Abrir menú')}>☰</button>
        <strong>MV Agendate IA</strong>
      </div>
      <div className="mv-app">
        <div className={`mv-sidebar-backdrop ${abierto ? 'open' : ''}`} onClick={cerrar} />
        <aside className={`mv-sidebar ${abierto ? 'open' : ''}`}>
          <div className="mv-ws">
            <img src="/logo-mv.svg" alt="MV" />
            <div><strong>MV Agendate IA</strong><span>{cuenta ? (cuenta.nombre || cuenta.email) : t('Espacio de trabajo')}</span></div>
          </div>
          <nav className="mv-nav">
            {PAGINAS.map((p) => (
              <NavLink key={p.to} to={p.to} onClick={cerrar} className={({ isActive }) => (isActive ? 'on' : '')}>
                <span className="ico">{p.ico}</span><span>{t(p.label)}</span>
              </NavLink>
            ))}
          </nav>
          <div className="mv-nav-bottom">
            {cuenta && <SaldoPill onIr={() => { cerrar(); nav('/cuenta'); }} />}
            <NavLink to="/cuenta" onClick={cerrar} className={({ isActive }) => (isActive ? 'on' : '')}>
              <span className="ico">👤</span><span>{cuenta ? t('Mi cuenta') : t('Cuenta online')}</span>
            </NavLink>
            {!cuenta && (
              <NavLink to="/cuentas-saas" onClick={cerrar} className={({ isActive }) => (isActive ? 'on' : '')}>
                <span className="ico">🏢</span><span>{t('Cuentas SaaS')}</span>
              </NavLink>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: '.85rem', color: 'inherit' }}>
              <span className="ico">🌐</span>
              <select value={idioma()} onChange={(e) => setIdioma(e.target.value)} aria-label={t('Idioma')} style={{ flex: 1, padding: '4px 6px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'transparent', color: 'inherit', fontSize: '.85rem' }}>
                <option value="es">🇺🇾 Español</option>
                <option value="pt">🇧🇷 Português</option>
              </select>
            </label>
            <a href="/"><span className="ico">🏠</span><span>{t('Inicio')}</span></a>
            <a href="/config.html"><span className="ico">⚙️</span><span>{t('Configuración')}</span></a>
            {!cuenta && <button type="button" onClick={pedirClave}><span className="ico">🔑</span><span>{t('Clave admin')}</span></button>}
          </div>
        </aside>
        <main className="mv-main">
          <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/panel" replace />} />
            <Route path="/panel" element={<Panel />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/:id" element={<Clientes />} />
            <Route path="/dashboards" element={<Dashboards />} />
            <Route path="/ayuda" element={<Ayuda />} />
            <Route path="/cuenta" element={<Cuenta />} />
            <Route path="/cuentas-saas" element={<CuentasAdmin />} />
            <Route path="*" element={<Navigate to="/panel" replace />} />
          </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </>
  );
}
