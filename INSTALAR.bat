@echo off
chcp 65001 >nul
title MV Agendate IA - Instalador
echo.
echo  ============================================
echo   MV AGENDATE IA - INSTALADOR
echo  ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo  [X] No se encontro Node.js.
  echo      Descargalo de https://nodejs.org (version LTS^) e instala.
  echo      Despues volve a ejecutar este instalador.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo  [OK] Node.js %%v detectado.

echo  [..] Instalando dependencias (puede tardar 1-2 minutos)...
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
  echo  [X] Fallo npm install. Revisa tu conexion a internet.
  pause
  exit /b 1
)

if not exist .env (
  copy .env.example .env >nul
  echo  [OK] Archivo .env creado. Edita .env para cargar tus claves
  echo       (sin claves funciona en MODO DEMO igual^).
)

echo.
echo  [OK] Instalacion completa.
echo       Para arrancar la plataforma ejecuta INICIAR.bat
echo.
pause
