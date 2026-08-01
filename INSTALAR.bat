@echo off
chcp 65001 >nul
setlocal EnableExtensions
title MV Agendate IA - Preparar desde el codigo fuente
REM Ir SIEMPRE a la carpeta donde esta este archivo. Sin esto, si lo abris
REM desde otra ubicacion, npm instala en la carpeta equivocada. Las comillas
REM son obligatorias: la ruta puede tener espacios (ej. "D:\PROGRAMAS MV\...").
cd /d "%~dp0"

REM Nota de estilo: este script usa etiquetas y GOTO en vez de bloques ( )
REM anidados a proposito. Dentro de un bloque, cmd.exe expande %VARIABLE%
REM cuando PARSEA el bloque, no cuando lo ejecuta: si la variable quedo vacia,
REM "if %VAR% LSS 500" se convierte en "if  LSS 500" y el script muere con un
REM error de sintaxis incomprensible para el cliente.

echo.
echo  ============================================
echo   MV AGENDATE IA
echo  ============================================
echo.
echo  Esto prepara el programa desde el codigo fuente.
echo.
echo  Si sos cliente y solo queres USAR el programa, no necesitas esto:
echo  descarga el instalador MV-Agendate-IA-Setup.exe, que te deja elegir
echo  la carpeta, crea el acceso directo y el desinstalador, y no requiere
echo  internet ni instalar Node.js.
echo.
pause
echo.

REM Probamos node DIRECTAMENTE en vez de con "where node": lo que importa no
REM es si figura en el PATH sino si se puede ejecutar. Con "where" el script
REM seguia de largo cuando ese comando no estaba disponible, y el cliente veia
REM errores crudos de npm en lugar del aviso claro de instalar Node.js.
node -v >nul 2>nul
if errorlevel 1 goto :sin_node
for /f "tokens=*" %%v in ('node -v') do echo  [OK] Node.js %%v detectado.

REM --- Espacio libre ANTES de bajar nada ----------------------------------
REM El error mas comun aca es quedarse sin espacio a mitad de la descarga:
REM npm deja node_modules a medio escribir y tira "ENOSPC", que no lo entiende
REM nadie. Mejor avisar antes, en castellano, y no empezar siquiera.
set "UNIDAD=%~d0"
set "UNIDAD=%UNIDAD::=%"
call :medir_libre
if "%LIBRE_MB%"=="0" goto :instalar
echo  [OK] Espacio libre en %~d0 %LIBRE_MB% MB.
if %LIBRE_MB% LSS 500 goto :sin_espacio

:instalar
REM --omit=dev es lo que hace la diferencia: sin eso npm baja tambien las
REM herramientas de desarrollo (Electron, empaquetadores, tests) que suman
REM ~568 MB y que el programa NO necesita para funcionar. Con --omit=dev son
REM ~25 MB.
echo.
echo  [..] Instalando lo necesario para funcionar ^(~25 MB^)...
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 goto :fallo_install

echo.
echo  [OK] Listo.
echo.
echo       Para arrancar el programa: INICIAR.bat ^(en esta misma carpeta^)
echo.
echo       La primera vez te va a pedir tu clave de Claude. Si no tenes,
echo       podes saltearla: el programa funciona igual en modo demo.
echo.
pause
exit /b 0

REM ------------------------------------------------------------------------
:sin_node
echo  [X] No se encontro Node.js.
echo      Te abro la pagina de descarga: instala la version LTS
echo      y volve a ejecutar este archivo.
echo.
start "" https://nodejs.org/es/download
pause
exit /b 1

:sin_espacio
echo.
echo  [X] Espacio insuficiente en el disco %~d0
echo      Libres: %LIBRE_MB% MB  -  Necesarios: al menos 500 MB.
echo.
echo      Libera espacio ^(vaciar la Papelera, Liberador de espacio de
echo      Windows^) o copia esta carpeta a otro disco con mas lugar,
echo      y volve a ejecutar este archivo.
echo.
pause
exit /b 1

:fallo_install
echo.
REM Volvemos a medir el disco: si ahora quedo sin espacio, esa fue la causa
REM real. Antes este script culpaba SIEMPRE a la conexion a internet, aunque
REM el disco estuviera lleno, y mandaba al cliente a revisar donde no era.
call :medir_libre
if "%LIBRE_MB%"=="0" goto :fallo_generico
if %LIBRE_MB% LSS 300 goto :fallo_disco
goto :fallo_generico

:fallo_disco
echo  [X] Te quedaste sin espacio en el disco %~d0 ^(%LIBRE_MB% MB libres^).
echo      Esa es la causa: NO fue un problema de internet.
echo.
echo      Libera espacio y volve a ejecutar este archivo.
echo.
pause
exit /b 1

:fallo_generico
echo  [X] No se pudo completar la instalacion.
echo.
echo      Revisa arriba el mensaje de npm. Las causas mas comunes:
echo        - Sin internet, o proxy/firewall que bloquea npm.
echo        - Antivirus bloqueando la escritura en esta carpeta.
echo        - Falta de permisos: proba con "Ejecutar como administrador".
echo.
pause
exit /b 1

REM Deja %LIBRE_MB% con los MB libres del disco, o "0" si no se pudo medir
REM (nunca vacio: una variable vacia rompe el "if" que la compara).
:medir_libre
set "LIBRE_MB="
for /f "usebackq tokens=*" %%A in (`powershell -NoProfile -Command "[int]((Get-PSDrive -Name '%UNIDAD%').Free/1MB)" 2^>nul`) do set "LIBRE_MB=%%A"
if not defined LIBRE_MB set "LIBRE_MB=0"
if "%LIBRE_MB%"=="" set "LIBRE_MB=0"
goto :eof
