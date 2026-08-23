@echo off
chcp 65001 >nul
setlocal EnableExtensions
title MV Agendate IA - Configurar el sistema de licencias
REM (c) 2026 Martin Viera. Todos los derechos reservados.
REM
REM Sin tildes ni simbolos especiales a proposito: chcp 65001 + un caracter no
REM ASCII cerca de la linea "title" corrompe el parseo de cmd.exe (paso de
REM "title" a "tle" + un comando fantasma "M") - el mismo motivo por el que
REM INSTALAR.bat e INICIAR.bat tampoco usan tildes.
REM
REM Deja el sistema de licencias listo para vender, con un doble clic.
REM
REM Esto es HERRAMIENTA DEL DUENO, no del cliente: genera el par de claves con
REM el que se firman las licencias vendidas. No se empaqueta en la entrega (ni
REM package.json ni empaquetar-pc.sh copian los .bat de la raiz ni scripts/).
REM
REM Ir SIEMPRE a la carpeta de este archivo: si se abre desde otra ubicacion,
REM node no encuentra el proyecto. Las comillas son obligatorias porque la ruta
REM puede tener espacios.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto SIN_NODE

node scripts\configurar-licencias.js
if errorlevel 1 goto FALLO

echo.
echo  Listo. Segui los pasos de arriba en el orden que aparecen.
echo.
pause
exit /b 0

:SIN_NODE
echo.
echo  ============================================
echo   FALTA NODE.JS
echo  ============================================
echo.
echo  Este configurador necesita Node.js, que es gratis y se instala
echo  una sola vez:
echo.
echo      https://nodejs.org   (boton verde LTS)
echo.
echo  Instalalo, cerra esta ventana y volve a abrir este archivo.
echo.
pause
exit /b 1

:FALLO
echo.
echo  Algo no salio bien. El motivo esta escrito mas arriba, en rojo o
echo  con una X. Si no se entiende, copia toda esta ventana y guardala.
echo.
pause
exit /b 1
