@echo off
setlocal enabledelayedexpansion
title MV Agendate IA - activar version DUENO
REM (c) 2026 Martin Viera. Todos los derechos reservados.
REM Software propietario. Uso sujeto a LICENSE.
REM ===================================================================
REM  Activa la version DUENO de MV Agendate IA: sin clave y sin limite.
REM
REM  NO hace falta copiarlo a ninguna carpeta: detecta solo donde esta
REM  instalado el programa. Doble clic y listo.
REM
REM  COMO FUNCIONA
REM    El sello es un archivo FIRMADO digitalmente (Ed25519) con la
REM    clave privada del dueno, que no viaja con el producto: copiarse
REM    este .bat no le sirve a nadie para fabricar sellos nuevos, y
REM    escribir el archivo a mano tampoco -- el programa verifica la
REM    firma al arrancar (src/store/sello-owner.js).
REM
REM    Se escribe en DOS lugares:
REM      1. El perfil del usuario (%%USERPROFILE%%\.mv-agendate-ia).
REM         Vale para CUALQUIER carpeta de instalacion y sobrevive a
REM         reinstalaciones y actualizaciones. Por esto no hay que
REM         copiar el .bat a ningun lado.
REM      2. La carpeta del programa, si se encuentra (de yapa).
REM ===================================================================

echo.
echo  ================================================
echo   MV Agendate IA - activar version DUENO
echo  ================================================
echo.

set "SELLO={"token": "MV1.eyJ0aXBvIjoib3duZXIiLCJlbWl0aWRvIjoiMjAyNi0wOC0xMlQxMzoxNTozNy45NDZaIn0.9C9cqjUqhWwKxwAjh_uFZtaxOXvb7ddYj3ZVHD_4tXo8KCc5uJzRwNyfa256gyChILx9gYVb7-B9-_5OhpC3AQ"}"

REM --- 1) El perfil del usuario: alcanza solo, este donde este instalado ---
set "PERFIL=%USERPROFILE%\.mv-agendate-ia"
if not exist "%PERFIL%" mkdir "%PERFIL%"
(echo !SELLO!)>"%PERFIL%\licencia-owner.json"
if not exist "%PERFIL%\licencia-owner.json" goto :fallo
echo  [OK] Sello del dueno escrito en tu perfil:
echo       %PERFIL%\licencia-owner.json
echo.

REM --- 2) Detectar la instalacion (opcional: refuerza, no hace falta) ---
set "APP="
if exist "%~dp0resources\app\src\store\prueba.js" set "APP=%~dp0resources\app"
if not defined APP if exist "%~dp0src\store\prueba.js" set "APP=%~dp0."
if not defined APP if exist "%LOCALAPPDATA%\Programs\MV Agendate IA\resources\app\src\store\prueba.js" set "APP=%LOCALAPPDATA%\Programs\MV Agendate IA\resources\app"
if not defined APP if exist "%LOCALAPPDATA%\Programs\MV Agendate IA (Dueno)\resources\app\src\store\prueba.js" set "APP=%LOCALAPPDATA%\Programs\MV Agendate IA (Dueno)\resources\app"
if not defined APP (
  REM Registro de programas instalados: de aca sale la carpeta elegida en el
  REM instalador aunque no sea la estandar (disco D:, etc.).
  for /f "tokens=2*" %%A in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /v InstallLocation 2^>nul ^| findstr /i "Agendate"') do (
    if exist "%%B\resources\app\src\store\prueba.js" set "APP=%%B\resources\app"
  )
)

if defined APP (
  if not exist "!APP!\data" mkdir "!APP!\data"
  (echo !SELLO!)>"!APP!\data\licencia-owner.json"
  echo  [OK] Tambien sellada la instalacion encontrada en:
  echo       !APP!
) else (
  echo  No encontre la carpeta del programa, pero NO importa: el sello
  echo  del perfil alcanza para cualquier instalacion de esta PC.
)

echo.
echo  Abri MV Agendate IA: sin clave, sin limite de dias.
echo  Para volver a la version normal, borra estos archivos:
echo    %PERFIL%\licencia-owner.json
if defined APP echo    !APP!\data\licencia-owner.json
echo.
pause
exit /b 0

:fallo
echo  [X] No pude escribir en tu perfil de usuario. Proba ejecutar este
echo      archivo como administrador (clic derecho - Ejecutar como admin).
echo.
pause
exit /b 1
