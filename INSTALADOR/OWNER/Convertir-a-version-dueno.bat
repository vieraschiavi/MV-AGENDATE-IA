@echo off
setlocal
title MV Agendate IA - pasar a version DUENO
cd /d "%~dp0"

REM ===================================================================
REM  Pasa CUALQUIER copia instalada de MV Agendate IA (instalador .exe
REM  O paquete portable) a la version DUENO: sin clave de licencia y
REM  sin limite de dias. La deteccion es AUTOMATICA, la hace el .ps1 de
REM  al lado -no hace falta copiar nada a la carpeta del programa ni
REM  saber donde quedo instalado.
REM
REM  COMO SE USA
REM    1. Doble clic aca, desde donde sea (Escritorio, Descargas, un
REM       pendrive). Si hay mas de una copia instalada, elegi cual.
REM    2. Abri el programa: ya no pide nada.
REM
REM  Si la deteccion automatica no encuentra la copia sola, tambien se
REM  puede arrastrar la carpeta del programa arriba de este .bat, o
REM  escribir la ruta cuando lo pida.
REM
REM  QUE HACE POR DENTRO
REM    La edicion NO se guarda en una licencia ni en el registro de
REM    Windows: son dos archivos chiquitos adentro del programa que el
REM    motor lee al arrancar. El .ps1 los reemplaza por los de la
REM    variante dueno y deja una copia .original de cada uno, para
REM    poder volver atras corriendo esto de nuevo.
REM
REM  NO REPARTAS ESTE ARCHIVO NI Convertir-a-version-dueno.ps1: entre
REM  los dos convierten cualquier copia instalada en la version
REM  completa. Es la llave maestra de tu propio producto. Tienen que
REM  viajar SIEMPRE juntos, en la misma carpeta.
REM ===================================================================

if not exist "%~dp0Convertir-a-version-dueno.ps1" goto :sin_ps1

REM -ExecutionPolicy Bypass es SOLO para esta corrida (no cambia nada
REM en la maquina): asi anda aunque la politica de PowerShell del
REM sistema sea mas restrictiva. %1 reenvia la carpeta si se arrastro
REM una arriba del .bat.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Convertir-a-version-dueno.ps1" "%~1"
if errorlevel 1 goto :fallo_powershell
exit /b 0

:fallo_powershell
echo.
echo  No se pudo correr la deteccion automatica (PowerShell bloqueado,
echo  capaz por una politica de la empresa).
echo.
echo  Alternativa mas simple: instala directamente
echo  MV-Agendate-IA-Setup-Dueno.exe (esta misma carpeta) en vez de
echo  convertir una copia ya instalada.
echo.
pause
exit /b 1

:sin_ps1
echo.
echo  [X] Falta el archivo Convertir-a-version-dueno.ps1 al lado de
echo      este .bat. Tienen que estar los dos juntos, en la misma
echo      carpeta.
echo.
pause
exit /b 1
