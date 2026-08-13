// © 2026 Martín Viera. Todos los derechos reservados.
import React, { useEffect, useState } from 'react';
import { fetchAdmin, getJSON } from '../api.js';
import { t } from '../i18n.js';

// Candado de la prueba gratis de la copia descargada.
// - Mientras la prueba está vigente: un banner discreto con los días restantes.
// - Al vencer sin licencia: un overlay a pantalla completa que bloquea el uso
//   y ofrece comprar o activar la licencia que llegó al pagar.
// En el host (Vercel) y con licencia activa, /api/prueba responde que no aplica
// y este componente no muestra nada.
export default function CandadoPrueba() {
  const [estado, setEstado] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [msg, setMsg] = useState('');

  const cargar = () => getJSON('/api/prueba').then(setEstado).catch(() => setEstado(null));
  useEffect(() => { cargar(); }, []);

  if (!estado || !estado.aplica || estado.licenciada) return null;

  const activar = async (e) => {
    e.preventDefault();
    setMsg(t('Activando…'));
    const r = await fetchAdmin('/api/licencia/activar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok) { setMsg(t('✅ ¡Licencia activada! Gracias por tu compra.')); setTimeout(() => window.location.reload(), 1200); }
    else setMsg(d.error || t('No se pudo activar el código. Revisá que sea el que te llegó al comprar.'));
  };

  // Prueba vigente: banner de días restantes.
  if (!estado.vencida) {
    return (
      <div style={{
        background: '#fff7ed', borderBottom: '1px solid #fed7aa', color: '#9a3412',
        padding: '8px 16px', fontSize: '.85rem', textAlign: 'center',
      }}>
        🎁 {t('Prueba gratis')}: {estado.diasRestantes === 1 ? t('te queda 1 día') : `${t('te quedan')} ${estado.diasRestantes} ${t('días')}`}.{' '}
        <a href="/comprar.html" style={{ color: '#c2410c', fontWeight: 700 }}>{t('Comprá tu licencia →')}</a>
      </div>
    );
  }

  // Prueba vencida: overlay bloqueante.
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,42,67,.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 460, width: '100%', padding: 28, textAlign: 'center' }}>
        <img src="/logo-mv.svg" alt="MV" style={{ width: 56, height: 56, marginBottom: 10 }} />
        <h2 style={{ color: '#0f2a43', margin: '0 0 8px' }}>{t('Tu prueba gratis terminó')}</h2>
        <p style={{ color: '#5a6b7c', fontSize: '.92rem', margin: '0 0 18px' }}>
          {t('Gracias por probar MV Agendate IA. Para seguir usándolo, comprá tu licencia (pago único) y activala acá con el código que te llega al pagar.')}
        </p>
        <a href="/comprar.html" style={{
          display: 'block', background: '#1f7ae0', color: '#fff', textDecoration: 'none',
          fontWeight: 700, padding: 13, borderRadius: 10, marginBottom: 16,
        }}>{t('Comprar licencia →')}</a>
        <form onSubmit={activar} style={{ display: 'grid', gap: 8 }}>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder={t('Código de licencia (te llegó al comprar)')}
            style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '.9rem' }} />
          <button style={{ background: '#2ea043', color: '#fff', border: 0, borderRadius: 8, padding: 11, fontWeight: 700, cursor: 'pointer' }}>
            {t('Ya compré — activar licencia')}
          </button>
        </form>
        {msg && <p style={{ fontSize: '.85rem', marginTop: 10, color: '#44535f' }}>{msg}</p>}
      </div>
    </div>
  );
}
