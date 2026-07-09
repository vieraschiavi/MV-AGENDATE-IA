@echo off
title MV Agendate IA
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Necesitas Node.js instalado ^(gratis, una sola vez^).
  echo  Te abro la pagina de descarga: instala la version LTS y volve a abrir esto.
  echo.
  start "" https://nodejs.org/es/download
  pause
  exit /b
)
if not exist node_modules (
  echo  Preparando por primera vez, esto puede tardar un par de minutos...
  call npm install --omit=dev
)
echo  Abriendo MV Agendate IA en tu navegador...
start "" http://localhost:3000
node src/server.js
pause
