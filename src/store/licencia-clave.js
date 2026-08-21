// © 2026 Martín Viera. Todos los derechos reservados.

/**
 * Clave pública con la que la copia instalada verifica una licencia comprada.
 *
 * EL AGUJERO QUE ESTO TAPA
 * ------------------------
 * `store/prueba.js` daba por buena cualquier licencia de 6 caracteres o más.
 * Verificado corriendo el módulo de verdad: `activarLicencia("abcdef")`
 * devolvía ok y dejaba `licenciada: true` para siempre. O sea que el candado
 * de los 7 días de prueba se levantaba tipeando basura en el campo de
 * licencia, y el producto de US$ 299 quedaba desbloqueado sin pagar.
 *
 * POR QUÉ ASIMÉTRICA Y NO UN SECRETO COMPARTIDO
 * ---------------------------------------------
 * La opción obvia —firmar con HMAC y meter el secreto en el instalador—
 * funciona y es peor: con HMAC la clave que verifica es la MISMA que firma. Un
 * secreto adentro de un .exe que se descarga público (y acá se descarga
 * público a propósito: instalar.html lo ofrece gratis con 7 días full) se saca
 * con un editor hexadecimal, y quien lo saque se emite las licencias que
 * quiera. El negocio entero es la licencia.
 *
 * Con Ed25519 se separan: la privada firma y vive sólo en el servidor de
 * ventas (variable de entorno MV_LICENSE_PRIVATE_KEY); la pública verifica y
 * es esto de acá. Publicarla no habilita nada — es para lo que existe.
 *
 * Va como código y no como archivo .pem suelto para que viaje sola en el
 * empaquetado (zip, .exe y APK): un archivo de datos hay que acordarse de
 * incluirlo, y olvidarse deja al programa sin poder validar nada.
 *
 * Es el mismo diseño que ya usa MV Kobra AI en backend_venta/licencia_clave.py.
 *
 * CÓMO SE ENCIENDE
 * ----------------
 *   1. node scripts/licencia-par.js
 *   2. La privada que imprime va a Vercel como MV_LICENSE_PRIVATE_KEY.
 *   3. El bloque público que imprime se pega abajo, en PUBLICA.
 *
 * Mientras PUBLICA esté vacía el candado firmado queda APAGADO y se sigue
 * aceptando el formato viejo, para no dejar afuera a quien ya compró antes de
 * que existiera la firma. Apenas se pega la clave, la verificación pasa a ser
 * obligatoria. Ese estado se ve en /api/salud y se avisa por consola al
 * arrancar, para que "todavía no lo encendí" no pase inadvertido.
 */

/**
 * Clave pública de firma de licencias, en PEM. NO es secreta.
 * Vacía = candado firmado sin configurar todavía (ver arriba).
 */
export const PUBLICA = '';

/** Prefijo de las licencias firmadas, para distinguirlas de las viejas. */
export const PREFIJO = 'MVL1.';

/** true si el candado por firma está configurado en esta copia. */
export function firmaConfigurada() {
  return PUBLICA.trim().length > 0;
}
