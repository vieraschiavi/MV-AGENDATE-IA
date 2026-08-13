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

## OWNER/ — solo para el dueño, y ya NO vive en el repo

> **Esta carpeta está en `.gitignore`.** Antes no lo estaba, y ahí había un
> problema serio: el repo es **público**. El `MV-Agendate-IA-Setup-Dueno.exe`
> —la copia sin límite de prueba— estaba commiteado acá, o sea que cualquiera
> entraba a GitHub, hacía clic en *Download* y se llevaba el producto completo
> gratis. Sin saber nada del código, sin ninguna herramienta. Lo mismo el `.bat`
> que convierte una instalación normal en la del dueño.
>
> El README decía "repo privado". No lo era. Ahora nada de la variante dueño se
> commitea ni se publica: se arma en tu máquina cuando lo necesitás.

| Qué | Cómo se arma |
|---|---|
| Instalador del dueño | `npm run empaquetar-exe-owner` |
| Portable del dueño | `npm run empaquetar-pc-owner` |
| `Convertir-a-version-dueno.bat` | `npm run activador-dueno` (sale en `dist/`) |

Las tres cosas necesitan tu **clave privada de firma** (ver abajo): sin ella el
empaquetador corta en vez de sacar una entrega a medias.

### La edición dueño es una licencia firmada, no una bandera

Antes, "versión dueño" era `diasPrueba: 0` en un archivo de texto de una línea.
O sea que la llave del producto se escribía con el Bloc de notas. El `.bat` no
hacía nada que un cliente no pudiera hacer solo en treinta segundos.

Ahora la copia del dueño lleva adentro una **licencia perpetua firmada con
Ed25519**, que el programa verifica exactamente igual que la de un cliente que
pagó. Escribir el archivo a mano no sirve: sin la firma no verifica. Y poner
`diasPrueba: 0` ahora **bloquea** la copia en vez de liberarla — cero días de
prueba es una prueba vencida.

### `Convertir-a-version-dueno.bat` — cuándo sirve

Sirve para no bajar 97 MB cuando ya tenés la versión normal instalada: deja un
`licencia.txt` con la licencia perpetua firmada adentro de la carpeta del
programa. Para volver atrás, se borra ese archivo.

**Busca la instalación solo.** El instalador deja elegir carpeta y disco, así
que puede estar en cualquier lado: mira al lado del propio `.bat`, el
`InstallLocation` del registro de Windows (HKCU y HKLM), `%LOCALAPPDATA%\Programs`
y Archivos de programa. Cada candidato lo confirma buscando un archivo del
programa antes de escribir nada.

**Es la llave maestra de tu propio producto: no lo repartas.** Convierte
cualquier copia instalada en la versión completa, para siempre. Si se filtra a
un cliente, a un chat o a una captura, cualquiera destraba lo que vendés.

## Las claves de firma

```bash
node scripts/licencias-firma.js init      # una sola vez: genera el par
```

- La **privada** queda en `scripts/licencia-privada.pem`, que está en
  `.gitignore`. **Nunca al repo.** Quien la tenga puede fabricar licencias de tu
  producto.
- La **pública** se escribe sola en `src/store/clave-publica.js` y viaja adentro
  de cada copia entregada. No es secreta: sólo sirve para comprobar, no para
  firmar.
- Para que el cobro emita licencias solo, cargá la privada en Vercel como
  variable de entorno `MV_LICENCIA_PRIVADA_PEM`.

Emitir una licencia a mano (por ejemplo para reemplazarle el código viejo a un
cliente que ya había comprado):

```bash
node scripts/licencias-firma.js emitir --email cliente@mail.com --plan full
node scripts/licencias-firma.js emitir --email cliente@mail.com --dias 365   # con vencimiento
```

> **`init` una sola vez.** Correrlo de nuevo genera un par nuevo e **invalida
> todas las licencias ya vendidas**: el cliente que pagó se queda con un código
> que la app rechaza. Por eso pide `--reemplazar-par` explícito.

### Clientes con códigos viejos (`MV-PLAN-XXXXXXXX`)

Esos códigos no se pueden verificar en la máquina del cliente —son un HMAC que
necesita el secreto del servidor— así que las entregas nuevas **no los aceptan**.
Lo correcto es reemitirles una licencia firmada con el comando de arriba.

Si necesitás una entrega de transición mientras tanto:

```bash
npm run empaquetar-exe-legado
```

Esa acepta además el formato viejo. Ojo con lo que significa: como no se puede
comprobar, acepta **cualquier** texto con esa forma. Es para tapar un hueco de
días, no para vender.

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

**Para soporte:** el inicio de la prueba NO vive solo ahí. Se guarda también en
el perfil del usuario (`%USERPROFILE%\.mv-agendate-ia\prueba.json` en Windows) y
gana la fecha más vieja de las dos. Es a propósito: si viviera solo en `data/`,
borrar esa carpeta reiniciaría la prueba una y otra vez. Si un cliente reinstala
y dice que "perdió" días, esa es la razón — y lo correcto es activarle la
licencia, no borrarle el ancla.

## Cómo se regeneran (lo hace el CI, pero por si hace falta a mano)

```
npm run empaquetar-exe-todos   # los tres instaladores .exe  → dist-instalador/
npm run empaquetar-pc-todos    # los tres portables .zip     → INSTALADOR/ y public/descargas/
```

Los `.exe` requieren Windows (en CI corren en `windows-latest`). Los `.zip`
salen igual desde cualquier sistema: adentro no hay binarios, solo JavaScript.
