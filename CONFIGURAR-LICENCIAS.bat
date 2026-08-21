@echo off
REM (c) 2026 Martin Viera. Todos los derechos reservados.
REM Doble clic aca para dejar las licencias funcionando. No hay nada que tipear.
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   MV Agendate IA - Configurar licencias
echo   ------------------------------------
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Falta Node.js, que es lo unico que necesita esto.
  echo.
  echo       Bajalo gratis de  https://nodejs.org  ^(boton verde LTS^),
  echo       instalalo con Siguiente-Siguiente, y volve a hacer doble
  echo       clic aca. No hay que configurar nada mas.
  echo.
  pause
  exit /b 1
)
node scripts\configurar-licencias.js %*
echo.
pause
