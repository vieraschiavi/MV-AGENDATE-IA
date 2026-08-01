@echo off
title MV Agendate IA
cd /d "%~dp0"
REM Probamos node DIRECTAMENTE (no con "where"): lo que importa es si se puede
REM ejecutar, no si figura en el PATH.
node -v >nul 2>nul
if errorlevel 1 goto :sin_node
if not exist "node_modules" goto :preparar
goto :arrancar

:preparar
echo  Preparando por primera vez, esto puede tardar un par de minutos...
call npm install --omit=dev --no-audit --no-fund
REM Sin este chequeo, si la preparacion fallaba (sin internet, disco lleno,
REM antivirus) el script seguia igual y arrancaba el programa, que moria con
REM un "Cannot find module" que no le dice nada al cliente.
if errorlevel 1 goto :fallo_preparar

:arrancar
echo  Abriendo MV Agendate IA en tu navegador...
REM El navegador lo abre el PROGRAMA, no este script: si el puerto 3000 esta
REM ocupado por otra app, el programa usa el siguiente libre y solo el sabe
REM cual quedo. Antes esto abria localhost:3000 a ciegas.
set "MV_ABRIR_NAVEGADOR=1"
node src/server.js
pause
exit /b 0

:sin_node
echo.
echo  Necesitas Node.js instalado ^(gratis, una sola vez^).
echo  Te abro la pagina de descarga: instala la version LTS y volve a abrir esto.
echo.
start "" https://nodejs.org/es/download
pause
exit /b 1

:fallo_preparar
echo.
echo  [X] No se pudo preparar el programa.
echo.
echo      Causas mas comunes:
echo        - Sin internet ^(hace falta solo la primera vez^).
echo        - Sin espacio en el disco: necesitas unos 500 MB libres.
echo        - Antivirus bloqueando la escritura en esta carpeta.
echo.
echo      Solucionalo y volve a abrir este archivo.
echo.
pause
exit /b 1
