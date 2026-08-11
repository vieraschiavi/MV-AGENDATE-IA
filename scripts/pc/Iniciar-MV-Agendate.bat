@echo off
title MV Agendate IA
cd /d "%~dp0"

REM Lanzador de la version PORTABLE (sin instalar nada). Existe para las
REM empresas donde no se pueden abrir instaladores .exe: esto es un .bat de
REM texto plano que arranca el mismo programa.
REM
REM El paquete ya viene con la carpeta node_modules adentro, asi que NO hace
REM falta internet ni npm: solo Node.js instalado en la maquina.

REM Probamos node DIRECTAMENTE (no con "where"): lo que importa es si se puede
REM ejecutar, no si figura en el PATH.
node -v >nul 2>nul
if errorlevel 1 goto :sin_node
if not exist "node_modules" goto :preparar
goto :arrancar

:preparar
echo.
echo  Faltan las librerias (node_modules). Las bajo una sola vez, con internet...
echo.
call npm install --omit=dev --no-audit --no-fund
REM Sin este chequeo, si la preparacion fallaba (sin internet, disco lleno,
REM antivirus) el script seguia igual y arrancaba el programa, que moria con
REM un "Cannot find module" que no le dice nada al cliente.
if errorlevel 1 goto :fallo_preparar

:arrancar
echo.
echo   MV Agendate IA se esta abriendo en tu navegador.
echo.
echo   DEJA ESTA VENTANA NEGRA ABIERTA mientras usas el programa:
echo   es el motor. Si la cerras, el programa se apaga.
echo.
REM El navegador lo abre el PROGRAMA, no este script: si el puerto 3000 esta
REM ocupado por otra app, el programa usa el siguiente libre y solo el sabe
REM cual quedo. Ademas abre el PANEL de trabajo, no la pagina de venta.
set "MV_ABRIR_NAVEGADOR=1"
node src/server.js
echo.
echo  (el programa se cerro)
pause
exit /b 0

:sin_node
echo.
echo  Falta Node.js, que es el motor que necesita el programa.
echo  Es gratis y se instala una sola vez.
echo.
echo  Te abro la pagina de descarga: instala la version LTS,
echo  cerra esta ventana y volve a abrir este archivo.
echo.
start "" https://nodejs.org/es/download
pause
exit /b 1

:fallo_preparar
echo.
echo  [X] No se pudo preparar el programa.
echo.
echo      Causas mas comunes:
echo        - Sin internet ^(hace falta solo esta vez^).
echo        - Sin espacio en el disco: necesitas unos 200 MB libres.
echo        - Antivirus bloqueando la escritura en esta carpeta.
echo.
echo      Solucionalo y volve a abrir este archivo.
echo.
pause
exit /b 1
