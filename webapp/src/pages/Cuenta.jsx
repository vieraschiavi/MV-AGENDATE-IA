import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cuentaSesion, guardarSesion, cerrarSesion } from '../api.js';

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
      if (!d.ok) { setError(d.error || 'No se pudo iniciar sesión.'); return; }
      guardarSesion(d.token, d.cuenta);
      nav('/panel');
      window.location.reload(); // recarga para que todo el workspace lea la cuenta nueva
    } catch {
      setError('Error de conexión. Probá de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const salir = () => { cerrarSesion(); window.location.reload(); };

  const estiloLabel = { display: 'grid', gap: 4, fontSize: '.86rem', color: 'var(--muted)' };

  return (
    <>
      <div className="mv-pagehead">
        <div><div className="mv-crumb">Espacio de trabajo</div><h1>👤 Cuenta online</h1></div>
      </div>
      <div className="mv-content">
        {cuenta ? (
          <div className="card" style={{ maxWidth: 520 }}>
            <h2 className="mv-h">Mi cuenta</h2>
            <p style={{ margin: '0 0 4px' }}><strong>{cuenta.nombre || cuenta.email}</strong></p>
            <p style={{ margin: '0 0 10px', color: 'var(--muted)' }}>{cuenta.email}</p>
            <p style={{ margin: '0 0 14px' }}>
              Estado:{' '}
              <strong>
                {cuenta.estado === 'trial'
                  ? `Prueba gratis (${Math.max(0, Math.ceil((new Date(cuenta.trialHasta) - Date.now()) / 86400000))} días restantes)`
                  : cuenta.estado === 'activa' ? 'Suscripción activa' : cuenta.estado}
              </strong>
            </p>
            {cuenta.estado === 'trial' && (
              <p style={{ margin: '0 0 14px' }}>
                <a className="btn cel" href="/comprar.html?plan=saas">Activar suscripción (USD 15/mes)</a>
              </p>
            )}
            <button className="btn sec" onClick={salir}>Cerrar sesión</button>
          </div>
        ) : (
          <div className="card" style={{ maxWidth: 460 }}>
            <h2 className="mv-h">Usá MV desde el navegador, sin instalar nada</h2>
            <p style={{ fontSize: '.88rem', color: 'var(--muted)', margin: '0 0 12px' }}>
              14 días de prueba gratis, después USD 15/mes por MercadoPago. Tus datos y tu configuración (profesión, país, precios, horarios, equipo, canales) quedan privados y aislados, disponibles desde cualquier dispositivo.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button className={`btn ${modo === 'login' ? '' : 'sec'}`} onClick={() => setModo('login')} type="button">Iniciar sesión</button>
              <button className={`btn ${modo === 'registro' ? '' : 'sec'}`} onClick={() => setModo('registro')} type="button">Crear cuenta</button>
            </div>
            <form onSubmit={enviar} style={{ display: 'grid', gap: 10 }}>
              {modo === 'registro' && (
                <label style={estiloLabel}>Nombre o empresa
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Estudio Jurídico Pérez" />
                </label>
              )}
              <label style={estiloLabel}>Email
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
              </label>
              <label style={estiloLabel}>Contraseña {modo === 'registro' ? '(mínimo 8 caracteres)' : ''}
                <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              {error && <p style={{ color: '#dc2626', margin: 0, fontSize: '.86rem' }}>{error}</p>}
              <button className="btn" disabled={cargando}>
                {cargando ? 'Un momento…' : modo === 'registro' ? 'Crear cuenta (14 días gratis)' : 'Entrar'}
              </button>
            </form>
            <p style={{ marginTop: 12, fontSize: '.8rem', color: 'var(--muted)' }}>
              ¿Preferís tenerlo instalado en tu PC o Android con pago único? Esta pantalla es solo para el modo online — la versión descargable no necesita cuenta.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
