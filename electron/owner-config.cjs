// Config del build de escritorio. En el build normal (cliente pago, el que se
// vende) queda tal cual está acá: diasPrueba:null = sin override, corre la
// prueba de 3 días de siempre (ver src/store/prueba.js) hasta que el cliente
// activa su licencia. scripts/ofuscar.js sobreescribe esta ÚNICA línea según
// la variante del instalador:
//   --owner (empaquetar-exe-owner) → diasPrueba:0  (sin límite, copia del dueño)
//   --demo  (empaquetar-exe-demo)  → diasPrueba:3  (prueba de 3 días fija)
module.exports = { diasPrueba: null };
