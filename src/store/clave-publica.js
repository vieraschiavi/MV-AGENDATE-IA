// © 2026 Martín Viera. Todos los derechos reservados.

// Clave PÚBLICA Ed25519 contra la que se verifican las licencias (formato
// MVA1). Es pública a propósito: viaja adentro de cada copia entregada y no
// sirve para fabricar licencias, sólo para comprobarlas. La PRIVADA —la que
// firma— nunca entra al repo (ver scripts/licencias-firma.js).
//
// Vacía = todavía no se generó el par. En ese estado ninguna licencia verifica.
// Corriendo desde el código fuente eso se trata como modo desarrollo (la app no
// se bloquea); en una entrega empaquetada, en cambio, se cae a la prueba normal
// — nunca a "sin límite". Ver el comentario largo en store/prueba.js.
//
// Se genera y se escribe acá sola con:
//   node scripts/licencias-firma.js init
export const CLAVE_PUBLICA_B64 = '';
