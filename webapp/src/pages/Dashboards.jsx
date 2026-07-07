import React, { useEffect, useState, useCallback } from 'react';
import { getJSON, dinero } from '../api.js';

const COL = ['#1f7ae0', '#2ea043', '#e0b25c', '#8e44ad', '#e67e22', '#16a085', '#c0392b'];

const Barras = ({ obj, money }) => {
  const ents = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...ents.map((e) => e[1]), 1);
  if (!ents.length) return <span style={{ color: '#999' }}>Sin datos</span>;
  return ents.map(([k, v], i) => (
    <div key={k}>
      <span className="lab">{k}</span>
      <span className="b" style={{ width: Math.max(6, (v / max) * 130), background: COL[i % COL.length] }} />
      <span className="val">{money ? dinero(v) : v}</span>
    </div>
  ));
};

const LineChart = ({ meses, trabajos, facturacion }) => {
  const W = 1000, H = 280, pad = 36, n = meses.length;
  const maxT = Math.max(...trabajos, 1);
  const maxF = Math.max(...facturacion, 1);
  const x = (i) => pad + (i * (W - 2 * pad)) / Math.max(1, n - 1);
  const yT = (v) => H - pad - (v / maxT) * (H - 2 * pad);
  const yF = (v) => H - pad - (v / maxF) * (H - 2 * pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e6ebf1" />
      {meses.map((m, i) => (
        <text key={m} x={x(i)} y={H - 12} fontSize="10" fill="#8a8a8a" textAnchor="middle">{m.slice(5)}</text>
      ))}
      <polyline points={trabajos.map((v, i) => `${x(i).toFixed(1)},${yT(v).toFixed(1)}`).join(' ')} fill="none" stroke="#1f7ae0" strokeWidth="2" />
      <polyline points={facturacion.map((v, i) => `${x(i).toFixed(1)},${yF(v).toFixed(1)}`).join(' ')} fill="none" stroke="#2ea043" strokeWidth="2" strokeDasharray="4,3" />
    </svg>
  );
};

// Estimador de impuestos del país configurado (IA con respaldo local):
// ingresá tu facturación mensual y te muestra régimen, carga y neto.
const Impuestos = ({ sugerido, moneda }) => {
  const [ingresos, setIngresos] = useState('');
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);

  const estimar = async () => {
    const monto = Number(ingresos || sugerido || 0);
    if (!monto) return;
    setCargando(true);
    setResultado(null);
    try {
      const r = await fetch('/api/impuestos/estimar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingresosMensuales: monto }),
      }).then((x) => x.json());
      setResultado(r);
    } catch {
      setResultado({ ok: false, error: 'Error de red.' });
    }
    setCargando(false);
  };

  return (
    <div className="card wide" style={{ marginTop: 16 }}>
      <h2 className="mv-h">🧾 Neto estimado según los impuestos de tu país</h2>
      <p style={{ fontSize: '.85rem', color: 'var(--muted)', margin: '0 0 10px' }}>
        La IA estima tu carga impositiva (régimen simplificado, aportes) según la ley de tu país
        configurado y calcula cuánto te queda neto. Orientativo — no reemplaza a tu contador.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="number" placeholder={`Facturación mensual${sugerido ? ` (sugerido: ${Math.round(sugerido)})` : ''}`}
          value={ingresos} onChange={(e) => setIngresos(e.target.value)} style={{ width: 260 }}
        />
        <button className="btn cel" onClick={estimar} disabled={cargando}>
          {cargando ? 'Estimando…' : 'Estimar impuestos'}
        </button>
      </div>
      {resultado && !resultado.ok && <div className="aviso warn">{resultado.error}</div>}
      {resultado?.ok && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: '.9rem' }}>
            <strong>{resultado.pais}</strong> · Régimen sugerido: <strong>{resultado.regimen_sugerido}</strong>
            {resultado.fuente === 'ia' ? ' · calculado con IA' : ' · guía local aproximada'}
          </div>
          <div className="mv-tablewrap" style={{ marginTop: 8 }}>
            <table className="mv-table">
              <tbody>
                <tr><td>Facturación bruta</td><td style={{ textAlign: 'right' }}>{dinero(resultado.ingresos_brutos)} {moneda}</td></tr>
                {resultado.detalle.map((d, i) => (
                  <tr key={i}><td style={{ color: 'var(--muted)' }}>− {d.concepto}</td><td style={{ textAlign: 'right', color: 'var(--danger)' }}>{dinero(d.monto)}</td></tr>
                ))}
                <tr><td><strong>Neto estimado</strong></td><td style={{ textAlign: 'right' }}><strong style={{ color: '#1a7f37' }}>{dinero(resultado.neto_estimado)} {moneda}</strong></td></tr>
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 8 }}>{resultado.notas}</div>
          <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 4 }}>{resultado.descargo}</div>
        </div>
      )}
    </div>
  );
};

export default function Dashboards() {
  const [filtro, setFiltro] = useState({ anio: '', mes: '', oficio: '', estado: '', profesionalId: '' });
  const [opciones, setOpciones] = useState(null);
  const [datos, setDatos] = useState(null);
  const [parametros, setParametros] = useState(null);
  useEffect(() => { getJSON('/api/parametros').then(setParametros).catch(() => {}); }, []);

  const qs = useCallback(() => new URLSearchParams(Object.entries(filtro).filter(([, v]) => v)).toString(), [filtro]);

  const cargar = useCallback(async () => {
    const q = qs();
    const [d, s, opt, anual] = await Promise.all([
      getJSON('/api/dashboard?' + q),
      getJSON('/api/dashboard/serie?' + q),
      getJSON('/api/dashboard/filtros'),
      getJSON('/api/dashboard/serie-anual?' + q),
    ]);
    setOpciones((prev) => prev || { ...opt, meses: s.meses });
    setDatos({ d, s, anual });
  }, [qs]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!datos) return <div className="mv-content"><div className="mv-empty">Cargando…</div></div>;
  const { d, s, anual } = datos;
  const ult = s.meses.length - 1;
  const deltaT = s.trabajos[ult] - s.trabajos[ult - 1];
  const deltaF = s.facturacion[ult] - s.facturacion[ult - 1];
  const Delta = ({ v }) => (v === 0 ? null : <span className={`d ${v > 0 ? 'up' : 'down'}`}>{v > 0 ? '▲ +' : '▼ '}{v} vs mes ant.</span>);
  const q = qs();
  const sel = (campo) => ({ value: filtro[campo], onChange: (e) => setFiltro({ ...filtro, [campo]: e.target.value }) });
  const multi = (opciones?.profesionales || []).length > 1;

  return (
    <>
      <div className="mv-pagehead">
        <div><div className="mv-crumb">Espacio de trabajo</div><h1>📊 Dashboards</h1></div>
      </div>
      <div className="mv-content">
        <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
          <div><label>Año</label><select {...sel('anio')}><option value="">Todos</option>{(opciones?.anios || []).map((a) => <option key={a}>{a}</option>)}</select></div>
          <div><label>Mes</label><select {...sel('mes')}><option value="">Todos</option>{(opciones?.meses || []).map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          <div><label>Oficio</label><select {...sel('oficio')}><option value="">Todos</option>{(opciones?.oficios || []).map((o) => <option key={o}>{o}</option>)}</select></div>
          <div><label>Estado</label><select {...sel('estado')}><option value="">Todos</option>{(opciones?.estados || []).map((e) => <option key={e}>{e}</option>)}</select></div>
          {multi && <div><label>Profesional</label><select {...sel('profesionalId')}><option value="">Todos</option>{opciones.profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="btn sec" href={'/api/agenda.csv' + (q ? '?' + q : '')}>⬇️ Agenda CSV</a>
            <a className="btn sec" href={'/api/agenda.xls' + (q ? '?' + q : '')}>⬇️ Agenda Excel</a>
            <a className="btn sec" href="/api/clientes.xls">⬇️ Clientes Excel</a>
          </div>
        </div>

        <div className="kpis">
          {[
            ['Trabajos totales', d.total, null],
            ['Completados', d.completadas, null],
            ['Cancelados', d.canceladas, null],
            ['Sueldo total (completados)', dinero(d.sueldo_total || 0), null],
            ['Ticket promedio', dinero(d.ticket_promedio || 0), null],
            ['Trabajos (12m)', s.total_trabajos, <Delta key="t" v={deltaT} />],
            ['Facturado (12m)', dinero(s.total_facturado), <Delta key="f" v={deltaF} />],
          ].map(([l, n, delta]) => (
            <div className="kpi" key={l}><div className="n">{n}</div><div className="l">{l}</div>{delta}</div>
          ))}
        </div>

        <div className="card wide">
          <h2 className="mv-h">📈 Evolución mensual — trabajos y facturación (12 meses)</h2>
          <LineChart meses={s.meses} trabajos={s.trabajos} facturacion={s.facturacion} />
          <div className="leg" style={{ display: 'flex', gap: 14, fontSize: '.76rem', marginTop: 8 }}>
            <span><i style={{ width: 12, height: 12, borderRadius: 3, display: 'inline-block', background: '#1f7ae0', marginRight: 5 }} />Trabajos</span>
            <span><i style={{ width: 12, height: 12, borderRadius: 3, display: 'inline-block', background: '#2ea043', marginRight: 5 }} />Facturación (escala propia)</span>
          </div>
        </div>

        <div className="grid2" style={{ marginTop: 16 }}>
          <div className="card"><h2 className="mv-h">Trabajos por oficio</h2><div className="barlist"><Barras obj={d.por_oficio} /></div></div>
          <div className="card"><h2 className="mv-h">Trabajos por estado</h2><div className="barlist"><Barras obj={d.por_estado} /></div></div>
          <div className="card"><h2 className="mv-h">Trabajos por día de la semana</h2><div className="barlist"><Barras obj={Object.fromEntries(d.por_dia_semana.map((x) => [x.dia, x.cantidad]))} /></div></div>
          <div className="card"><h2 className="mv-h">Comparativa año contra año</h2><div className="barlist"><Barras obj={Object.fromEntries(anual.map((a) => [a.anio, a.trabajos]))} /></div></div>
        </div>

        <Impuestos sugerido={s.total_facturado / 12} moneda={parametros?.moneda || ''} />
      </div>
    </>
  );
}
