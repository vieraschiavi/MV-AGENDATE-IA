import React, { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Panel from './pages/Panel.jsx';
import Agenda from './pages/Agenda.jsx';
import Clientes from './pages/Clientes.jsx';
import Dashboards from './pages/Dashboards.jsx';
import Ayuda from './pages/Ayuda.jsx';
import Cuenta from './pages/Cuenta.jsx';
import CuentasAdmin from './pages/CuentasAdmin.jsx';
import CandadoPrueba from './pages/CandadoPrueba.jsx';
import ErrorBoundary from './pages/ErrorBoundary.jsx';
import { claveAdmin, cuentaSesion } from './api.js';
import { t, idioma, setIdioma } from './i18n.js';

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

  const pedirClave = () => {
    const k = prompt(t('Clave de administración:'), claveAdmin());
    if (k != null) localStorage.setItem('mvAdminKey', k);
  };

  return (
    <>
      <CandadoPrueba />
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
