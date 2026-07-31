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

## Regenerarlo

```
npm run empaquetar-exe-owner
cp dist-instalador/MV-Agendate-IA-Setup-Dueno.exe distribucion-dueno/
```

## Instalación

Igual que la versión de venta: doble clic, elegís la carpeta de instalación,
acepta la licencia, y queda con ícono en el escritorio, entrada en el menú
de programas y desinstalador — nada manual.
