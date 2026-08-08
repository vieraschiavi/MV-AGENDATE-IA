// Duración de la prueba gratis de la copia DESCARGADA (PC/APK), en un solo
// lugar. La leen los dos extremos:
//   - store/prueba.js  → el candado en runtime (cuántos días quedan / bloqueo)
//   - scripts/ofuscar.js → la fija dentro del instalador del cliente, para que
//     la variable de entorno DIAS_PRUEBA de la máquina del comprador no pueda
//     estirar (ni desactivar) la prueba.
// El trial del SaaS online es otra cosa y vive en store/cuentas.js.
export const DIAS_PRUEBA_CLIENTE = 7;
