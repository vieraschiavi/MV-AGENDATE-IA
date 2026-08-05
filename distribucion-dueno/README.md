# Versión del dueño (sin límite de prueba)

`MV-Agendate-IA-Setup-Dueno.exe` es el mismo instalador de Windows que se vende
(mismo asistente con selección de carpeta, mismo desinstalador, mismo código
ofuscado — ver `scripts/ofuscar.js` y `package.json` → `build`), con una única
diferencia: **la prueba de 3 días viene desactivada** (`DIAS_PRUEBA=0`, ver
`electron/owner-config.cjs`). El resto del programa es idéntico — arranca,
pide tu propia clave de Claude en `/config.html` como cualquier instalación,
y no tiene ninguna otra restricción distinta a la versión que se vende.

**No se sube a la web pública** (no vive en `public/`, así que Vercel nunca lo
sirve) — solo está disponible clonando o descargando este archivo desde este
repositorio privado de GitHub.

## Las tres variantes del instalador

| Variante | Comando | Artefacto | Prueba |
|---|---|---|---|
| Cliente pago (se vende) | `npm run empaquetar-exe` | `MV-Agendate-IA-Setup.exe` | 3 días, se destraba con la licencia del pago |
| Demo | `npm run empaquetar-exe-demo` | `MV-Agendate-IA-Setup-Demo.exe` | 3 días fijos (ignora `DIAS_PRUEBA` del entorno) |
| Dueño | `npm run empaquetar-exe-owner` | `MV-Agendate-IA-Setup-Dueno.exe` | Sin límite |

`npm run empaquetar-exe-todos` genera las tres en serie. La del dueño es
**IDÉNTICA a la que descargan los compradores** — mismo nombre de producto
("MV Agendate IA"), mismo appId, mismos accesos directos y desinstalador; lo
único distinto es el nombre del archivo del instalador y que la prueba viene
desactivada por dentro. La demo sí tiene identidad propia ("(Demo)") y puede
convivir instalada con la de venta. El CI (`build-windows-exe.yml`) publica
cliente y demo en el release `desktop-windows-latest`; la del dueño se sube
SOLO como artifact privado del workflow, nunca al release — y además vive
committeada en esta carpeta.

## Regenerarlo

```
npm run empaquetar-exe-owner
cp dist-instalador/MV-Agendate-IA-Setup-Dueno.exe distribucion-dueno/
```

## Instalación

Igual que la versión de venta: doble clic, elegís la carpeta de instalación,
acepta la licencia, y queda con ícono en el escritorio, entrada en el menú
de programas y desinstalador — nada manual.
