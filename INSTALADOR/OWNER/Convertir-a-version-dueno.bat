@echo off
setlocal enabledelayedexpansion
title MV Agendate IA - pasar a version DUENO
cd /d "%~dp0"

REM ===================================================================
REM  Pasa una copia YA INSTALADA de MV Agendate IA a la version DUENO:
REM  sin clave de licencia y sin limite de dias.
REM
REM  COMO SE USA
REM    Doble clic. Nada mas.
REM
REM    Antes habia que copiar este archivo A MANO a la carpeta donde
REM    quedo instalado el programa, y si no acertabas cortaba con un
REM    "no encontre el programa". Como el instalador deja ELEGIR la
REM    carpeta, esa carpeta puede estar en cualquier lado -- y el que
REM    instalo hace meses no se acuerda. Ahora la busca solo.
REM
REM  DONDE BUSCA, en este orden (y por que):
REM    1. Al lado de este archivo      -> si ya lo copiaste, sigue andando
REM    2. El registro de Windows       -> donde el instalador anoto la
REM                                       carpeta que ELEGISTE vos
REM    3. %LOCALAPPDATA%\Programs      -> el lugar por defecto
REM    4. Archivos de programa         -> por si se instalo para todos
REM
REM    Cada candidato se CONFIRMA buscando un archivo del programa antes
REM    de tocar nada: si no aparece, se descarta. Asi nunca escribe en
REM    una carpeta que no es, que seria peor que no encontrarla.
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
echo  Buscando la instalacion...

set "APP="

REM --- 1. Al lado de este archivo (o dentro de la carpeta del programa) ---
call :probar "resources\app"
call :probar "..\resources\app"
call :probar "app"
call :probar "."

REM --- 2. El registro: la carpeta que el usuario ELIGIO al instalar ---
REM Se recorren TODAS las entradas de desinstalacion y se prueba cada
REM InstallLocation. No se busca por nombre ni por GUID a proposito: el
REM nombre de la clave lo arma electron-builder, y atarse a el romperia
REM esto en silencio si cambia. Confirmar con el archivo marcador es mas
REM robusto y no depende de como se llame la clave.
if not defined APP call :buscar_registro "HKCU"
if not defined APP call :buscar_registro "HKLM"

REM --- 3. La carpeta por defecto del instalador (por usuario) ---
if not defined APP if exist "%LOCALAPPDATA%\Programs" (
  for /d %%D in ("%LOCALAPPDATA%\Programs\*") do (
    if not defined APP call :probar "%%~fD\resources\app"
  )
)

REM --- 4. Instalacion para todos los usuarios ---
if not defined APP if exist "%ProgramFiles%" (
  for /d %%D in ("%ProgramFiles%\*Agendate*") do (
    if not defined APP call :probar "%%~fD\resources\app"
  )
)
if not defined APP if exist "%ProgramFiles(x86)%" (
  for /d %%D in ("%ProgramFiles(x86)%\*Agendate*") do (
    if not defined APP call :probar "%%~fD\resources\app"
  )
)

if not defined APP goto :no_encontre

set "CFG=%APP%\electron\owner-config.cjs"
set "DIAS=%APP%\src\store\dias-prueba.js"

if not exist "%DIAS%" goto :no_encontre

REM --- Si ya esta en modo dueno, ofrecer volver atras ---
findstr /c:"diasPrueba: 0" "%CFG%" >nul 2>nul
if not errorlevel 1 goto :ya_esta

echo  [OK] Encontrada en:
echo       %APP%
echo.
echo  Voy a sacarle el limite de prueba y el pedido de licencia.
echo.
pause

REM El motor lee estos archivos AL ARRANCAR: con el programa abierto el
REM cambio no se ve hasta reiniciarlo, y ademas los archivos pueden estar
REM bloqueados. Se cierra aca en vez de pedirselo al usuario y confiar.
taskkill /F /IM "MV Agendate IA.exe" /T >nul 2>&1

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
echo  Abri MV Agendate IA y comprobalo.
echo.
echo  Para volver a la version normal, corre este mismo archivo otra vez.
echo.
pause
exit /b 0

REM ===================================================================
REM  :probar <carpeta>
REM  Marca la carpeta como la instalacion SOLO si tiene el archivo que
REM  este script necesita tocar. Verificar el marcador -- y no solo que
REM  la carpeta exista -- es lo que evita escribir en el lugar
REM  equivocado, que seria peor que no encontrarla.
REM ===================================================================
:probar
if defined APP exit /b 0
if exist "%~1\electron\owner-config.cjs" set "APP=%~1"
exit /b 0

REM ===================================================================
REM  :buscar_registro <HKCU|HKLM>
REM  Recorre las entradas de "Agregar o quitar programas" y prueba cada
REM  InstallLocation. Ahi es donde queda anotada la carpeta que el
REM  usuario eligio en el instalador.
REM ===================================================================
:buscar_registro
for /f "tokens=2,*" %%A in ('reg query "%~1\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /v InstallLocation 2^>nul ^| findstr /i "REG_SZ"') do (
  if not defined APP call :probar "%%B\resources\app"
  if not defined APP call :probar "%%B"
)
exit /b 0

:ya_esta
echo  Esta copia YA esta en version dueno (sin clave ni limite).
echo       %APP%
echo.
if not exist "%CFG%.original" goto :sin_backup
set /p RESP=" Queres volverla a la version normal (con prueba)? [s/N] "
if /i not "!RESP!"=="s" goto :sin_cambios
taskkill /F /IM "MV Agendate IA.exe" /T >nul 2>&1
copy /y "%CFG%.original" "%CFG%" >nul
copy /y "%DIAS%.original" "%DIAS%" >nul
echo.
echo  [OK] Volvio a la version normal, con su prueba de dias.
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
exit /b 1

:no_encontre
echo.
echo  [X] No encontre MV Agendate IA instalado en esta PC.
echo.
echo      Busque al lado de este archivo, en el registro de Windows,
echo      en %LOCALAPPDATA%\Programs y en Archivos de programa.
echo.
echo      Las dos razones habituales:
echo        - El programa todavia no esta instalado: instalalo primero
echo          con MV-Agendate-IA-Setup.exe y volve a correr esto.
echo        - Lo instalaste en una carpeta suelta (un disco externo, una
echo          carpeta propia). En ese caso copia ESTE archivo adentro de
echo          esa carpeta y volve a hacer doble clic.
echo.
echo      Para encontrarla: clic derecho en el acceso directo del
echo      escritorio - "Abrir ubicacion del archivo".
echo.
pause
exit /b 1

:fallo
echo.
echo  [X] No pude escribir los archivos del programa.
echo      Carpeta: %APP%
echo.
echo      Suele ser una de estas:
echo        - El antivirus bloquea la escritura en esa carpeta.
echo        - Se instalo en "Archivos de programa" y hace falta
echo          ejecutar este .bat como administrador
echo          (clic derecho - "Ejecutar como administrador").
echo.
pause
exit /b 1
