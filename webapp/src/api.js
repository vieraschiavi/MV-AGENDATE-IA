// Helpers de red compartidos por todas las páginas del workspace.

/** Clave de administración persistida (misma que usaba la versión clásica). */
export function claveAdmin() {
  return localStorage.getItem('mvAdminKey') || '';
}

/**
 * fetch con X-Admin-Key; ante un 401 pide la clave una vez y reintenta
 * (mismo comportamiento que la versión clásica del panel).
 */
export async function fetchAdmin(url, opts = {}) {
  opts.headers = { ...(opts.headers || {}), 'X-Admin-Key': claveAdmin() };
  let r = await fetch(url, opts);
  if (r.status === 401) {
    const k = prompt('Clave de administración:');
    if (k == null) return r;
    localStorage.setItem('mvAdminKey', k);
    opts.headers['X-Admin-Key'] = k;
    r = await fetch(url, opts);
  }
  return r;
}

export const getJSON = (url) => fetch(url).then((r) => r.json());

export const dinero = (n) => (n != null ? '$ ' + Number(n).toLocaleString('es-UY') : '—');
