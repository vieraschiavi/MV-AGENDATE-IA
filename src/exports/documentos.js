// Exportación de la agenda: ficha de cita imprimible (PDF vía navegador) y
// planillas Excel/CSV de citas y clientes, con los mismos filtros del
// dashboard. Sin dependencias externas.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => (n || n === 0) ? '$ ' + Number(n).toLocaleString('es-UY') : '';

/**
 * Ficha completa de una cita en HTML (sirve para PDF vía "Imprimir" del navegador).
 * @param {object} c cita/trabajo (ver store/trabajos.js)
 * @param {object} opts { agencia, telefono, logo }
 */
export function fichaCitaHTML(c, opts = {}) {
  const { agencia = 'MV Agendate IA', telefono = '', logo = '/logo-mv.svg' } = opts;
  const cot = c.cotizacion || {};
  const datos = [
    ['Cliente', c.clienteNombre], ['Oficio', c.oficioNombre], ['Trabajo', c.trabajoNombre],
    ['Fecha', c.fecha], ['Horario', `${c.inicio} - ${c.fin}`],
    ['Dirección', c.direccion], c.receptor && ['Atiende', c.receptor],
    ['Estado', c.estado], ['Canal', c.canal]
  ].filter(Boolean);

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(c.id)}</title>
<style>
  body{ font-family:Segoe UI,system-ui,Arial,sans-serif; color:#22303e; margin:0; padding:28px; }
  .cab{ display:flex; align-items:center; gap:14px; border-bottom:3px solid #0f2a43; padding-bottom:14px; margin-bottom:18px; }
  .cab img{ width:52px; height:52px; }
  h1{ font-size:1.4rem; margin:0; color:#0f2a43; }
  .total{ font-size:1.7rem; font-weight:800; color:#1f7ae0; margin:8px 0 16px; }
  table{ width:100%; border-collapse:collapse; margin-bottom:16px; }
  th,td{ text-align:left; padding:7px 10px; border-bottom:1px solid #e3e9f0; font-size:.95rem; }
  th{ width:34%; color:#5a6b7c; }
  .pie{ margin-top:20px; border-top:1px solid #e3e9f0; padding-top:10px; color:#6a7885; font-size:.85rem; }
  h2{ font-size:1.05rem; color:#0f2a43; margin:16px 0 8px; }
  @media print{ .noprint{ display:none; } }
</style></head><body>
<div class="cab"><img src="${esc(logo)}" alt="logo"><div><h1>${esc(c.trabajoNombre || 'Trabajo')}</h1>
<div style="color:#6a7885;font-size:.9rem;">${esc(agencia)}${telefono ? ' · ' + esc(telefono) : ''} · Cita ${esc(c.id)}</div></div></div>
${cot.total != null ? `<div class="total">Total: ${esc(money(cot.total))}</div>` : ''}
<h2>Datos de la cita</h2>
<table>${datos.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
${cot.total != null ? `<h2>Presupuesto</h2><table>
<tr><th>Mano de obra</th><td>${esc(money(cot.mano_obra))}</td></tr>
<tr><th>Materiales</th><td>${esc(money(cot.materiales))}</td></tr>
<tr><th>Traslado</th><td>${esc(money(cot.traslado))}</td></tr>
<tr><th>Total</th><td>${esc(money(cot.total))}</td></tr>
</table>` : ''}
<div class="pie">Generado por ${esc(agencia)} · MV Agendate IA</div>
<p class="noprint" style="text-align:center;margin-top:20px;"><button onclick="print()" style="padding:10px 20px;font-size:1rem;">🖨️ Imprimir / Guardar PDF</button></p>
</body></html>`;
}

function csvDe(cols, filas) {
  const cel = (v) => {
    if (v == null) return '';
    const s = String(typeof v === 'boolean' ? (v ? 'sí' : 'no') : v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + cols.join(',') + '\n' + filas.map((f) => cols.map((c) => cel(f[c])).join(',')).join('\n');
}
function excelHTMLDe(cols, filas) {
  const th = cols.map((c) => `<th>${esc(c)}</th>`).join('');
  const rows = filas.map((f) => '<tr>' + cols.map((c) => `<td>${esc(f[c] == null ? '' : (typeof f[c] === 'boolean' ? (f[c] ? 'sí' : 'no') : f[c]))}</td>`).join('') + '</tr>').join('');
  return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:x='urn:schemas-microsoft-com:office:excel'><head><meta charset="utf-8"></head>` +
    `<body><table border="1"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

// Planilla de citas/agenda (CSV/Excel), respetando los mismos filtros del dashboard.
const COLS_CITAS = ['id', 'fecha', 'inicio', 'fin', 'clienteNombre', 'oficioNombre', 'trabajoNombre', 'direccion', 'receptor', 'estado', 'canal'];
export function citasParaExportar(citas) {
  return citas.map((c) => ({ ...c, mano_obra: c.cotizacion?.mano_obra, materiales: c.cotizacion?.materiales, traslado: c.cotizacion?.traslado, total: c.cotizacion?.total }));
}
export function agendaCSV(citas) { return csvDe([...COLS_CITAS, 'mano_obra', 'materiales', 'traslado', 'total'], citasParaExportar(citas)); }
export function agendaExcelHTML(citas) { return excelHTMLDe([...COLS_CITAS, 'mano_obra', 'materiales', 'traslado', 'total'], citasParaExportar(citas)); }

// Planilla de clientes (CSV/Excel).
const COLS_CLIENTES = ['id', 'nombre', 'telefono', 'email', 'direccion', 'receptorHabitual', 'notas', 'creado'];
export function clientesCSV(clientes) { return csvDe(COLS_CLIENTES, clientes); }
export function clientesExcelHTML(clientes) { return excelHTMLDe(COLS_CLIENTES, clientes); }
