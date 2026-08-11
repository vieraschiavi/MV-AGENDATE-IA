@echo off
setlocal enabledelayedexpansion
title MV Agendate IA - pasar a version DUENO
cd /d "%~dp0"

REM ===================================================================
REM  Pasa una copia YA INSTALADA de MV Agendate IA a la version DUENO:
REM  sin clave de licencia y sin limite de dias.
REM
REM  COMO SE USA
REM    1. Copia este archivo a la carpeta donde quedo instalado el
REM       programa (la que tiene "MV Agendate IA.exe").
REM    2. Cerra el programa si lo tenes abierto.
REM    3. Doble clic aca.
REM    4. Abri el programa: ya no pide nada.
REM
REM  QUE HACE POR DENTRO
REM    La edicion NO se guarda en una licencia ni en el registro: son
REM    dos archivos chiquitos adentro de la carpeta del programa, que
REM    el motor lee al arrancar. Este script los reemplaza por los de
REM    la variante dueno (dias de prueba = 0 = candado apagado) y deja
REM    una copia .original de cada uno para poder volver atras.
REM
REM  NO REPARTAS ESTE ARCHIVO: convierte cualquier copia instalada en
REM  la version completa. Es la llave maestra de tu propio producto.
REM ===================================================================

echo.
echo  ================================================
echo   MV Agendate IA - pasar a version DUENO
echo  ================================================
echo.

REM --- Buscar la carpeta de la app (electron-builder la deja en resources\app) ---
set "APP="
if exist "resources\app\electron\owner-config.cjs" set "APP=resources\app"
if not defined APP if exist "..\resources\app\electron\owner-config.cjs" set "APP=..\resources\app"
if not defined APP if exist "app\electron\owner-config.cjs" set "APP=app"
if not defined APP if exist "electron\owner-config.cjs" set "APP=."
if not defined APP goto :no_encontre

set "CFG=%APP%\electron\owner-config.cjs"
set "DIAS=%APP%\src\store\dias-prueba.js"

if not exist "%DIAS%" goto :no_encontre

REM --- Si ya esta en modo dueno, ofrecer volver atras ---
findstr /c:"diasPrueba: 0" "%CFG%" >nul 2>nul
if not errorlevel 1 goto :ya_esta

echo  Encontre el programa en: %APP%
echo.
echo  Voy a sacarle el limite de prueba y el pedido de licencia.
echo.
pause

REM --- Copia de seguridad (solo la primera vez) ---
if not exist "%CFG%.original" copy /y "%CFG%" "%CFG%.original" >nul
if not exist "%DIAS%.original" copy /y "%DIAS%" "%DIAS%.original" >nul

REM --- Escribir el sello de la variante dueno ---
> "%CFG%" echo module.exports = { diasPrueba: 0 };

> "%DIAS%" echo export const DIAS_PRUEBA_CLIENTE = 7;
>> "%DIAS%" echo export const DIAS_FIJADOS = 0;

REM --- Verificar que quedo escrito de verdad ---
findstr /c:"diasPrueba: 0" "%CFG%" >nul 2>nul
if errorlevel 1 goto :fallo
findstr /c:"DIAS_FIJADOS = 0" "%DIAS%" >nul 2>nul
if errorlevel 1 goto :fallo

echo.
echo  [OK] Listo. Esta copia quedo en version DUENO.
echo.
echo       - No pide clave de licencia.
echo       - No tiene limite de dias.
echo       - Desaparece el cartel de "te quedan N dias".
echo.
echo  Abri MV Agendate IA y comprobalo. Si estaba abierto, cerralo
echo  y volve a abrirlo: el motor lee estos archivos al arrancar.
echo.
echo  Para volver a la version normal, corre este mismo archivo otra vez.
echo.
pause
exit /b 0

:ya_esta
echo  Esta copia YA esta en version dueno (sin clave ni limite).
echo.
if not exist "%CFG%.original" goto :sin_backup
set /p RESP=" Queres volverla a la version normal (con prueba)? [s/N] "
if /i not "!RESP!"=="s" goto :sin_cambios
copy /y "%CFG%.original" "%CFG%" >nul
copy /y "%DIAS%.original" "%DIAS%" >nul
echo.
echo  [OK] Volvio a la version normal, con su prueba de dias.
echo       Cerra y volve a abrir el programa.
echo.
pause
exit /b 0

:sin_cambios
echo.
echo  No toque nada. Sigue en version dueno.
echo.
pause
exit /b 0

:sin_backup
echo  No encontre las copias .original, asi que no puedo revertir desde aca.
echo  Si necesitas la version con prueba, reinstala con el instalador normal.
echo.
pause
exit /b 0

:no_encontre
echo  [X] No encontre el programa instalado desde aca.
echo.
echo      Copia este archivo A LA CARPETA DONDE ESTA INSTALADO
echo      MV Agendate IA (la que contiene "MV Agendate IA.exe")
echo      y volve a ejecutarlo.
echo.
echo      Para encontrarla: clic derecho en el acceso directo del
echo      escritorio - "Abrir ubicacion del archivo".
echo.
pause
exit /b 1

:fallo
echo.
echo  [X] No pude escribir los archivos del programa.
echo.
echo      Suele ser una de estas:
echo        - El programa esta abierto: cerralo y proba de nuevo.
echo        - El antivirus bloquea la escritura en esa carpeta.
echo        - Se instalo en "Archivos de programa" y hace falta
echo          ejecutar este .bat como administrador
echo          (clic derecho - "Ejecutar como administrador").
echo.
pause
exit /b 1
