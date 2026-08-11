# INSTALADOR — las entregas de Windows listas para usar

Esta carpeta viene incluida en el ZIP del repo (GitHub → **Code → Download ZIP**)
y **el CI la actualiza sola** en cada build de `main` (ver
`.github/workflows/build-windows-exe.yml`): no hay que regenerar nada a mano.

Cada variante viene en **dos formatos**, porque no en todos lados se puede
instalar un ejecutable:

| Formato | Archivo | Cuándo usarlo |
|---|---|---|
| **Instalador** | `...Setup*.exe` | Lo normal. Asistente con selección de carpeta; deja **ícono en el escritorio, entrada en el menú de programas y desinstalador** en "Agregar o quitar programas". No pide permisos de administrador. |
| **Portable** | `...PC*.zip` | Cuando la empresa del cliente **no deja abrir instaladores**. Se descomprime y se abre con un `.bat` de texto plano. No instala nada ni toca el registro. |

Las dos son el mismo programa (Electron + Node por dentro, sin Streamlit ni
ninguna otra dependencia externa) y abren en el **panel de trabajo**, no en la
landing de venta.

> **Ojo con el portable:** necesita **Node.js** instalado en la máquina (gratis,
> una sola vez; el `.bat` abre la página de descarga si falta). Las librerías ya
> van adentro del zip, así que no hace falta internet ni `npm` para arrancar. Si
> la política de la empresa bloquea *cualquier* ejecutable, `node.exe` también
> cuenta — ahí no hay paquete que sirva y conviene la cuenta online (SaaS).

## CLIENTE/ — lo que descargan los compradores

| Archivo | Qué es |
|---|---|
| `MV-Agendate-IA-Setup.exe` | **Oficial (se vende)**, instalador. Arranca con **prueba de 7 días**; al día 7 sin pagar se bloquea. Cuando el cliente paga por MercadoPago, la licencia lo destraba sin límite. |
| `MV-Agendate-IA-PC.zip` | **Oficial, portable.** Lo mismo, sin instalador. |
| `MV-Agendate-IA-Setup-Demo.exe` | **Demo**, instalador: prueba de 3 días fijos. Identidad propia ("MV Agendate IA (Demo)"), puede convivir con la versión de venta. |
| `MV-Agendate-IA-PC-Demo.zip` | **Demo, portable.** |

El flujo del cliente: descarga la **oficial** desde la web → la usa completa
7 días → al vencer, el panel queda bloqueado con la pantalla de "Comprar
licencia" → paga por MercadoPago → activa el código que recibe y sigue sin
límite. La oficial (exe y zip) también se publica en el release
`desktop-windows-latest`, y la web la sirve desde `public/descargas/`.

Los días de prueba viajan **fijados adentro** de cada entrega — los escribe
`scripts/ofuscar.js` en los dos archivos que los leen (ver
`scripts/variante-instalador.js`):

- `electron/owner-config.cjs` → lo lee la ventana de escritorio.
- `src/store/dias-prueba.js` → lo lee el servidor, o sea **también el paquete
  portable**, que corre `src/` con node y nunca pasa por Electron.

Sin eso, el comprador podría poner `DIAS_PRUEBA=0` en las variables de entorno
de su Windows y quedarse con el programa sin pagar.

## OWNER/ — solo para el dueño

| Archivo | Qué es |
|---|---|
| `MV-Agendate-IA-Setup-Dueno.exe` | **Versión del dueño**, instalador: idéntica a la de venta (mismo producto, mismos accesos directos y desinstalador, mismo código ofuscado) pero con la **prueba desactivada** (`diasPrueba: 0`): funciona sin licencia ni límite de días. |
| `MV-Agendate-IA-PC-Dueno.zip` | **Versión del dueño, portable.** Misma idea, para llevar en un pendrive. |
| `Convertir-a-version-dueno.bat` | Pasa una copia **ya instalada** (la normal, la que se vende) a versión dueño, sin reinstalar. Se copia a la carpeta donde quedó instalado el programa y se le hace doble clic. |

### Convertir-a-version-dueno.bat — cuándo sirve y cuándo no

Sirve para no bajar 97 MB cuando ya tenés la versión normal instalada: reemplaza
los dos archivos donde viaja la edición —`electron/owner-config.cjs` y
`src/store/dias-prueba.js`, dentro de `resources\app\`— por los de la variante
dueño, y deja una copia `.original` de cada uno. Corriéndolo de nuevo ofrece
volver atrás. El resto del programa (incluido el código ofuscado) no se toca.

**Es la llave maestra de tu propio producto: no lo repartas.** Convierte
cualquier copia instalada en la versión completa, así que si se filtra a un
cliente, a un chat o a una captura, cualquiera puede destrabar lo que vendés.
Por eso vive solo acá, en `INSTALADOR/OWNER/` del repo privado — nunca en
`public/`, nunca en el release, nunca adentro de un paquete.

Si tenés dudas, usá directamente `MV-Agendate-IA-Setup-Dueno.exe`: es el mismo
resultado sin ningún archivo suelto dando vueltas.

**Nunca se publican en la web ni en el release**: no viven en `public/` (Vercel
no las sirve) y no van al release público. Su único canal es esta carpeta del
repo **privado** — solo quien tiene acceso al repo (vos) puede bajarlas.

## Qué trae el portable adentro

```
MV-Agendate-IA/
  Iniciar-MV-Agendate.bat        ← doble clic acá (Windows)
  Iniciar-MV-Agendate.command    ← Mac / Linux
  Crear-acceso-directo.bat       ← opcional: ícono en escritorio y menú Inicio
  Quitar-accesos-directos.bat    ← saca esos accesos directos
  LEEME.txt                      ← instrucciones para el cliente
  logo-mv.ico  src/  public/  node_modules/  package.json
```

Los datos del cliente (agenda, clientes, precios) quedan en la subcarpeta
`data/` de esa misma carpeta: copiándola se muda todo a otra máquina.

## Cómo se regeneran (lo hace el CI, pero por si hace falta a mano)

```
npm run empaquetar-exe-todos   # los tres instaladores .exe  → dist-instalador/
npm run empaquetar-pc-todos    # los tres portables .zip     → INSTALADOR/ y public/descargas/
```

Los `.exe` requieren Windows (en CI corren en `windows-latest`). Los `.zip`
salen igual desde cualquier sistema: adentro no hay binarios, solo JavaScript.
