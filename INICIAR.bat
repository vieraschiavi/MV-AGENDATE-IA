@echo off
chcp 65001 >nul
setlocal EnableExtensions
title MV Agendate IA
REM Ir SIEMPRE a la carpeta de este archivo (comillas: la ruta puede tener
REM espacios, ej. "D:\PROGRAMAS MV\..."). Sin esto el programa no encuentra
REM src/ y falla con un error incomprensible.
cd /d "%~dp0"

REM Probamos node DIRECTAMENTE (no con "where"): lo que importa es si se puede
REM ejecutar, no si figura en el PATH.
node -v >nul 2>nul
if errorlevel 1 goto :sin_node
if not exist "node_modules" goto :sin_preparar

echo.
echo  Abriendo MV Agendate IA en tu navegador...
echo  ^(para cerrar el programa, cerra esta ventana negra^)
echo.
REM El navegador lo abre el PROGRAMA, no este script: si el puerto 3000 esta
REM ocupado por otra app, el programa usa el siguiente libre, y solo el sabe
REM cual quedo. Antes esto abria localhost:3000 a ciegas y podia terminar
REM mostrandote la OTRA aplicacion.
set "MV_ABRIR_NAVEGADOR=1"
node src/programa.js
pause
exit /b 0

:sin_node
echo.
echo  [X] No se encontro Node.js.
echo      Te abro la pagina de descarga: instala la version LTS
echo      y volve a abrir este archivo.
echo.
start "" https://nodejs.org/es/download
pause
exit /b 1

:sin_preparar
echo.
echo  [X] Falta preparar el programa la primera vez.
echo      Ejecuta INSTALAR.bat en esta misma carpeta y despues volve aca.
echo.
pause
exit /b 1
