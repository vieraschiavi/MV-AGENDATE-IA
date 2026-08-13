// © 2026 Martín Viera. Todos los derechos reservados.
// Config del build de escritorio. Este archivo del repo es el que corre cuando
// se arranca desde el código fuente (`npm start`): diasPrueba:null = sin
// override, vale la prueba de 7 días de src/store/dias-prueba.js.
//
// En los instaladores NO queda así: scripts/ofuscar.js sobreescribe esta ÚNICA
// línea según la variante, y electron/main.cjs inyecta el valor como
// DIAS_PRUEBA al servidor (pisando lo que haya en el entorno de la máquina):
//   (sin flag) empaquetar-exe       → diasPrueba:7  (prueba de 7 días, la que se vende)
//   --demo     empaquetar-exe-demo  → diasPrueba:3  (prueba de 3 días fija)
//   --owner    empaquetar-exe-owner → diasPrueba:0  (sin límite, copia del dueño)
module.exports = { diasPrueba: null };
