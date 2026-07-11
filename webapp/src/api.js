// Helpers de red compartidos por todas las páginas del workspace.

/** Clave de administración persistida (misma que usaba la versión clásica). */
export function claveAdmin() {
  return localStorage.getItem('mvAdminKey') || '';
}

// --- Sesión SaaS (cuenta online multi-cliente) ---
// Con sesión iniciada, TODAS las llamadas viajan con el token y el servidor
// aísla los datos de esa cuenta; sin sesión se opera el modo local de siempre.
export const tokenSesion = () => localStorage.getItem('mvToken') || '';
export const cuentaSesion = () => {
  try { return JSON.parse(localStorage.getItem('mvCuenta') || 'null'); } catch { return null; }
};
export function guardarSesion(token, cuenta) {
  localStorage.setItem('mvToken', token);
  localStorage.setItem('mvCuenta', JSON.stringify(cuenta));
}
export function cerrarSesion() {
  localStorage.removeItem('mvToken');
  localStorage.removeItem('mvCuenta');
}

const conAuth = (headers = {}) => {
  const t = tokenSesion();
  return t ? { ...headers, Authorization: `Bearer ${t}` } : headers;
};

/**
 * fetch con X-Admin-Key (y el token de la cuenta SaaS si hay sesión).
 * NUNCA interrumpe con un prompt: ante un 401 simplemente devuelve la
 * respuesta y la UI decide (el workspace invita a iniciar sesión; la clave
 * admin del vendedor se carga a mano desde el menú → "Clave admin").
 */
export async function fetchAdmin(url, opts = {}) {
  opts.headers = conAuth({ ...(opts.headers || {}), 'X-Admin-Key': claveAdmin() });
  return fetch(url, opts);
}

export const getJSON = (url) => fetch(url, { headers: conAuth() }).then((r) => r.json());

export const dinero = (n) => (n != null ? '$ ' + Number(n).toLocaleString('es-UY') : '—');
