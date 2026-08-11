// Duración de la prueba gratis de la copia DESCARGADA (PC/APK), en un solo
// lugar. La leen los dos extremos:
//   - store/prueba.js  → el candado en runtime (cuántos días quedan / bloqueo)
//   - scripts/ofuscar.js → la fija dentro de lo que se entrega, para que la
//     variable de entorno DIAS_PRUEBA de la máquina del comprador no pueda
//     estirar (ni desactivar) la prueba.
// El trial del SaaS online es otra cosa y vive en store/cuentas.js.
export const DIAS_PRUEBA_CLIENTE = 7;

// Días fijados por el empaquetador. En el repo vale null = "no hay nada fijado,
// vale el entorno o el default" (así `npm run dev` y los tests siguen pudiendo
// simular cualquier duración). scripts/ofuscar.js reescribe esta línea con el
// número de la variante — cliente 7, demo 3, dueño 0 — y ahí pasa a MANDAR
// sobre process.env.DIAS_PRUEBA.
//
// Esto es lo que hace que el candado sea real también en el paquete .bat, que
// corre src/ con node y no pasa por electron/main.cjs: sin esto, alcanzaba con
// poner DIAS_PRUEBA=0 en las variables de entorno de Windows para quedarse con
// el programa sin pagar.
export const DIAS_FIJADOS = null;
