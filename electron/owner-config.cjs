// Config del build de escritorio. En el build normal (el que se vende) queda
// tal cual está acá: diasPrueba:null = sin override, corre la prueba de 3 días
// de siempre (ver src/store/prueba.js). scripts/ofuscar.js --owner sobreescribe
// esta ÚNICA línea al generar la copia del dueño (npm run empaquetar-exe-owner),
// dejando diasPrueba:0 — eso desactiva la prueba por completo (mismo mecanismo
// que ya usa "el vendedor corre su propia copia sin límite" en prueba.js).
module.exports = { diasPrueba: null };
