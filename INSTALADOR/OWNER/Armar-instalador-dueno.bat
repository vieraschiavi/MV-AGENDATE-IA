@echo off
setlocal EnableExtensions
title MV Agendate IA - armar el instalador DUENO
REM (c) 2026 Martin Viera. Todos los derechos reservados.
REM
REM Sin tildes ni simbolos raros a proposito: chcp + un caracter no-ASCII
REM cerca de "title" rompe el parser de cmd.exe. Ver CONFIGURAR-LICENCIAS.bat.
REM ===================================================================
REM  ARMA TU INSTALADOR DE DUENO, DE UNA SOLA VEZ
REM
REM  Sale MV-Agendate-IA-Setup-Dueno.exe: el producto COMPLETO, plan Full,
REM  sin limite de dias. Es lo mismo que recibe un cliente que paga, pero
REM  con la licencia perpetua ya adentro: no pide codigo ni se vence.
REM
REM  COMO SE USA
REM    Doble clic aca. Nada mas. Si falta la clave de firma la genera,
REM    si faltan las dependencias las instala.
REM
REM  POR QUE ESTE .EXE NO ESTA EN GITHUB
REM    Porque este repo es PUBLICO. Un instalador sin limite de prueba
REM    subido aca lo descarga cualquiera con un clic y se queda con el
REM    producto completo gratis. Ya paso una vez (ver INSTALADOR/README.md).
REM    Por eso se arma en tu maquina, cuando lo necesitas, y no se sube.
REM
REM  NECESITA WINDOWS: electron-builder arma el .exe solo en Windows.
REM ===================================================================

cd /d "%~dp0..\.."
if not exist "package.json" goto :sin_repo

where node >nul 2>nul
if errorlevel 1 goto :sin_node

echo.
echo  ============================================
echo   ARMANDO EL INSTALADOR DE DUENO
echo  ============================================
echo.

REM --- 1. Dependencias -----------------------------------------------
if exist "node_modules\electron-builder" goto :deps_ok
echo  [1/4] Instalando dependencias (tarda unos minutos la primera vez)...
call npm ci
if errorlevel 1 goto :fallo_deps
goto :deps_listas
:deps_ok
echo  [1/4] Dependencias ya instaladas.
:deps_listas

REM --- 2. Clave de firma ---------------------------------------------
REM La variante dueno se distingue por llevar adentro una licencia
REM perpetua FIRMADA. Sin la clave privada no se puede firmar, y el
REM empaquetador corta en vez de sacar una entrega a medias.
echo.
if exist "scripts\licencia-privada.pem" goto :clave_ok
echo  [2/4] No hay par de claves. Generando uno nuevo...
call node scripts\licencias-firma.js init
if errorlevel 1 goto :fallo_clave
echo.
echo  IMPORTANTE: se genero tu par de claves.
echo    - La PUBLICA (src\store\clave-publica.js) hay que commitearla.
echo    - La PRIVADA (scripts\licencia-privada.pem) NUNCA se sube.
echo      Va en Vercel como MV_LICENCIA_PRIVADA_PEM.
echo    Corre CONFIGURAR-LICENCIAS.bat para el paso a paso.
goto :clave_listas
:clave_ok
echo  [2/4] Clave de firma ya existe - no se toca.
REM Regenerarla invalidaria todas las licencias ya vendidas.
:clave_listas

REM --- 3. Guardar los archivos que el empaquetador pisa ---------------
REM ofuscar.js NO trabaja sobre una copia: reescribe estos tres archivos
REM DENTRO del repo. Si el build queda a medias o nadie los restaura, el
REM arbol de trabajo queda con la licencia perpetua adentro de un archivo
REM rastreado por git - y un "git add -A" distraido la publica.
echo.
echo  [3/4] Guardando copia de los archivos de variante...
set "RESPALDO=%TEMP%\mv-variante-respaldo"
if not exist "%RESPALDO%" mkdir "%RESPALDO%"
copy /y "electron\owner-config.cjs"        "%RESPALDO%\owner-config.cjs"        >nul
copy /y "src\store\dias-prueba.js"         "%RESPALDO%\dias-prueba.js"          >nul
copy /y "src\store\licencia-incluida.js"   "%RESPALDO%\licencia-incluida.js"    >nul

REM --- 4. Armar el instalador ----------------------------------------
echo.
echo  [4/4] Armando el instalador (esto tarda varios minutos)...
echo.
call npm run empaquetar-exe-owner
set "RESULTADO=%ERRORLEVEL%"

REM Restaurar SIEMPRE, haya salido bien o mal.
echo.
echo  Restaurando los archivos de variante del repo...
copy /y "%RESPALDO%\owner-config.cjs"      "electron\owner-config.cjs"          >nul
copy /y "%RESPALDO%\dias-prueba.js"        "src\store\dias-prueba.js"           >nul
copy /y "%RESPALDO%\licencia-incluida.js"  "src\store\licencia-incluida.js"     >nul
rmdir /s /q "%RESPALDO%" 2>nul

if not "%RESULTADO%"=="0" goto :fallo_build
if not exist "dist-instalador\MV-Agendate-IA-Setup-Dueno.exe" goto :sin_exe

echo.
echo  ============================================
echo   LISTO
echo  ============================================
echo.
echo  Tu instalador quedo en:
echo.
echo      dist-instalador\MV-Agendate-IA-Setup-Dueno.exe
echo.
echo  Instalalo como cualquier programa. Abre directo en el panel
echo  completo: plan Full, sin pedir codigo y sin vencimiento.
echo.
echo  NO lo subas a GitHub ni se lo pases a nadie: es la version
echo  completa sin candado. El repo es publico.
echo.
pause
exit /b 0

:sin_repo
echo.
echo  [X] No encuentro package.json.
echo.
echo  Este .bat tiene que quedarse adentro de INSTALADOR\OWNER\ del
echo  proyecto. Si lo copiaste suelto al Escritorio, volve a ponerlo
echo  en su carpeta y abrilo desde ahi.
echo.
pause
exit /b 1

:sin_node
echo.
echo  ============================================
echo   FALTA NODE.JS
echo  ============================================
echo.
echo  Se instala una sola vez y es gratis:
echo.
echo      https://nodejs.org   (boton verde LTS)
echo.
echo  Instalalo, cerra esta ventana y volve a abrir este archivo.
echo.
pause
exit /b 1

:fallo_deps
echo.
echo  [X] Fallo la instalacion de dependencias (npm ci).
echo      Suele ser falta de internet. El motivo esta mas arriba.
echo.
pause
exit /b 1

:fallo_clave
echo.
echo  [X] No se pudo generar el par de claves. El motivo esta arriba.
echo.
pause
exit /b 1

:fallo_build
echo.
echo  [X] Fallo el empaquetado. El motivo esta escrito mas arriba.
echo.
echo  Los archivos del repo YA se restauraron, asi que no quedo nada
echo  a medias: podes volver a intentar sin limpiar nada.
echo.
pause
exit /b 1

:sin_exe
echo.
echo  [X] El empaquetado dijo que termino bien pero no aparecio
echo      dist-instalador\MV-Agendate-IA-Setup-Dueno.exe
echo.
pause
exit /b 1
