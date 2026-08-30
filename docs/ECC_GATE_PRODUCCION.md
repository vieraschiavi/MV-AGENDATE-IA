# MV Agendate IA — Gate de producción ECC

> Puntaje bajo la rúbrica de `.claude/skills/ecc/SKILL.md` (ECC v2.2.0,
> skill `production-audit`). **Evidencia ejecutada o no cuenta.**

**Veredicto: 88/100 → 9/10. Vendible, sin bloqueantes conocidos. Lo que separa
del 10 es cobertura de punta a punta del panel en navegador y un cobro real
por MercadoPago.**

## Evidencia ejecutada

| Verificación | Comando | Resultado |
|---|---|---|
| Linter (lo que CI corre primero) | `npm run lint` | ✅ verde |
| Suite completa | `npm test` | ✅ **349 pasaron**, 0 fallas, 0 skip, 20,5 s |
| Instalación limpia | `npm ci` | ✅ desde `package-lock.json` |
| Secretos versionados | `git ls-files \| grep -E '\.env$\|\.pem\|\.keystore'` | ✅ solo `.env.example` |

## Superficie de riesgo revisada

**Webhooks y firma.** `src/channels/firmas.js` valida `X-Hub-Signature-256`
contra el App Secret de Meta sobre el **cuerpo crudo** (`src/server.js:136`
lo guarda aparte justamente para eso). Cuatro tests cubren el ataque real:
un POST sin firma se rechaza, firmar con otro secreto no sirve, alterar el
cuerpo después de firmar se rechaza, y con la firma correcta acepta.

**Idempotencia de pagos.** `src/store/trabajos.js:359` y
`src/store/creditos.js:98` son idempotentes por id de pago de MercadoPago,
que es exactamente lo que la rúbrica exige para no tener tope duro: MP
reintenta y un reintento no cobra ni acredita dos veces. Cubierto por
`test/pagos-idempotencia.test.js` y `test/pedidos-concurrencia.test.js`.
`src/server.js:1032` agrega una guarda de idempotencia para el cliente que
toca "Comprar" varias veces.

**Aislamiento multi-cuenta.** `test/multi-profesional.test.js` y
`test/saas.test.js` cubren que la agenda y la cotización no mezclen datos
entre profesionales ni entre cuentas.

**Cron expuesto.** `/api/agenda/chequear-retrasos` manda WhatsApp reales a
toda la agenda. En Vercel o con `NODE_ENV=production` la ruta devuelve 401 si
no hay `CRON_SECRET` configurado — falla cerrado, que es lo correcto. Además
tiene rate limit propio (20 / 300 s).

**Operación.** `/salud` responde estado y modo demo. `vercel.json` declara la
función serverless, su `maxDuration` y el cron diario. `.env.example`
documenta las 58 líneas de configuración.

## Por qué 9 y no 10

Ningún tope duro aplica. Lo que falta:

1. **Sin E2E de navegador.** El panel React vive compilado en `public/app/` y
   no hay Playwright ni equivalente: ningún test recorre la pantalla que ve el
   profesional. Los 349 tests son de servidor y de lógica. La rúbrica topea en
   8/10 cuando el camino crítico no se probó de punta a punta — acá el camino
   crítico de **servidor** sí está cubierto (webhook → cobro → acreditación →
   agenda), y el de **interfaz** no.
2. **Sin cobro real verificado.** El circuito MercadoPago está probado contra
   dobles, no contra la pasarela en producción.
3. **Sin chequeo de arranque de las variables obligatorias.** El servidor
   levanta y recién falla al usar la función que necesita la clave que falta
   (ej. 503 en MercadoPago). Un fail-fast al arranque, con la lista de lo que
   falta, convierte un error de configuración en producción en un error de
   deploy.

## Arreglos de alto valor (en orden)

1. Un E2E de Playwright sobre el camino corto del panel: entrar, ver la
   agenda, cotizar un trabajo, cobrarlo. Es el que más sube el puntaje.
2. Validación de entorno al arranque: una lista de variables obligatorias por
   modo (escritorio / SaaS) que se chequea antes de escuchar en el puerto.
3. Una compra real de prueba por plan, documentada.

## Próxima acción

Antes de cada push: `npm run lint && npm test`, en ese orden — CI corre el
lint primero y si falla los tests ni se ejecutan.
