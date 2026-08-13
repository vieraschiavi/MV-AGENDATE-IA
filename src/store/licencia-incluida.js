// © 2026 Martín Viera. Todos los derechos reservados.

// Lo que el empaquetador fija adentro de cada entrega respecto de la licencia.
// Es el gemelo de dias-prueba.js: acá vale el default del repo, y
// scripts/ofuscar.js reescribe este archivo entero según la variante.
//
// Los dos valores tienen que viajar FIJADOS en la entrega, nunca leerse del
// entorno: si dependieran de una variable de la máquina del comprador, poner
// esa variable sería el nuevo agujero.

// Licencia perpetua FIRMADA que viaja dentro del build.
//
// Ésta es la variante DUEÑO. Antes el "sin límite" era `diasPrueba: 0` en un
// .cjs de una línea: cualquiera lo escribía con el Bloc de notas y tenía el
// producto completo. Un candado que se abre editando un archivo de texto no es
// un candado. Ahora la copia del dueño se distingue por llevar adentro una
// licencia firmada con la clave privada, que se verifica exactamente igual que
// la de un cliente que pagó. Escribir el archivo a mano no sirve: sin la firma
// no verifica.
//
// Vacía en el repo = copia normal, con su prueba.
export const LICENCIA_INCLUIDA = '';

// ¿Esta entrega acepta los códigos VIEJOS (MV-PLAN-XXXXXXXX)?
//
// Esos códigos no se pueden verificar en la máquina del cliente: son un HMAC
// que sólo el servidor puede comprobar. Aceptarlos es aceptar cualquier texto
// con esa forma — y la forma está en el código, que es público. O sea: dejarlo
// en true reabre el mismo agujero que este mecanismo vino a cerrar, sólo que
// pidiendo un guion de más.
//
// Queda en false por default. Sirve para una entrega de TRANSICIÓN, si hay
// clientes que ya compraron con un código viejo y todavía no se les reemitió
// uno firmado (`node scripts/licencias-firma.js emitir ...`):
//   npm run empaquetar-exe -- --legado
export const ACEPTA_LEGADO = false;
