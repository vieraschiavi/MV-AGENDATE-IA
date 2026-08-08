# INSTALADOR — los .exe de Windows listos para instalar

Esta carpeta viene incluida en el ZIP del repo (GitHub → **Code → Download ZIP**)
y **el CI la actualiza solo** en cada build de `main` (ver
`.github/workflows/build-windows-exe.yml`): no hay que regenerar nada a mano.

Los tres instaladores son la app de escritorio **Electron** (sin Streamlit ni
ninguna otra dependencia externa) empaquetada con electron-builder (NSIS):
doble clic, asistente con selección de carpeta, y quedan con **ícono en el
escritorio, entrada en el menú de programas y desinstalador** en
"Agregar o quitar programas". No piden permisos de administrador.

## CLIENTE/ — lo que descargan los compradores

| Archivo | Qué es |
|---|---|
| `MV-Agendate-IA-Setup-Demo.exe` | **Demo**: prueba de 3 días fijos. Identidad propia ("MV Agendate IA (Demo)"), puede convivir instalada con la versión de venta. |
| `MV-Agendate-IA-Setup.exe` | **Oficial (se vende)**: arranca con **prueba de 7 días** y, cuando el cliente paga (MercadoPago), la licencia del pago la destraba sin límite. Al día 7 sin pagar, el programa se bloquea. |

El flujo del cliente: descarga la **oficial** desde la web → la usa completa
7 días → al vencer, el panel queda bloqueado con la pantalla de "Comprar
licencia" → paga por MercadoPago → activa el código que recibe y sigue sin
límite. Estos dos exes también se publican en el release
`desktop-windows-latest` (la web de venta apunta ahí vía `DESCARGA_EXE_URL`).

Los días de prueba viajan **fijados adentro** de cada instalador (los escribe
`scripts/ofuscar.js`, ver `scripts/variante-instalador.js`): sin eso, el
comprador podría poner `DIAS_PRUEBA=0` en las variables de entorno de su
Windows y quedarse con el programa sin pagar.

## OWNER/ — solo para el dueño

| Archivo | Qué es |
|---|---|
| `MV-Agendate-IA-Setup-Dueno.exe` | **Versión del dueño**: idéntica a la de venta (mismo producto, mismos accesos directos y desinstalador, mismo código ofuscado) pero con la **prueba desactivada** (`diasPrueba: 0`, ver `electron/owner-config.cjs`): se instala y funciona **sin poner clave de licencia ni límite de días**. |

**Nunca se publica en la web ni en el release**: no vive en `public/` (Vercel no
la sirve) y no va al release público. Su único canal es esta carpeta del repo
**privado** — solo quien tiene acceso al repo (vos) puede bajarla, clonando o
con Code → Download ZIP.

## Cómo se regeneran (lo hace el CI, pero por si hace falta a mano)

```
npm run empaquetar-exe        # oficial  → dist-instalador/MV-Agendate-IA-Setup.exe
npm run empaquetar-exe-demo   # demo     → dist-instalador/MV-Agendate-IA-Setup-Demo.exe
npm run empaquetar-exe-owner  # dueño    → dist-instalador/MV-Agendate-IA-Setup-Dueno.exe
```

(`npm run empaquetar-exe-todos` corre las tres en serie; después copiar cada
exe a su subcarpeta acá.) Requiere Windows — en CI corre en `windows-latest`.
