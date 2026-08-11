@echo off
title MV Agendate IA - accesos directos
cd /d "%~dp0"

REM Le da a la version PORTABLE lo mismo que da el instalador .exe: icono en el
REM escritorio y entrada en el menu Inicio. No instala nada ni toca el registro
REM de Windows: son dos accesos directos (.lnk) que apuntan a esta carpeta.
REM Para "desinstalar", se corren Quitar-accesos-directos.bat y se borra la
REM carpeta. Por eso no necesita permisos de administrador.

echo.
echo  Creando el icono en el escritorio y en el menu Inicio...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "try {" ^
  "  $carpeta = '%~dp0';" ^
  "  $destino = Join-Path $carpeta 'Iniciar-MV-Agendate.bat';" ^
  "  $icono   = Join-Path $carpeta 'logo-mv.ico';" ^
  "  $sh = New-Object -ComObject WScript.Shell;" ^
  "  $sitios = @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'));" ^
  "  foreach ($sitio in $sitios) {" ^
  "    if (-not (Test-Path $sitio)) { continue }" ^
  "    $lnk = $sh.CreateShortcut((Join-Path $sitio 'MV Agendate IA.lnk'));" ^
  "    $lnk.TargetPath = $destino;" ^
  "    $lnk.WorkingDirectory = $carpeta;" ^
  "    $lnk.Description = 'MV Agendate IA - agenda, cotizador y CRM';" ^
  "    if (Test-Path $icono) { $lnk.IconLocation = $icono };" ^
  "    $lnk.Save();" ^
  "    Write-Host ('  [OK] ' + $sitio)" ^
  "  }" ^
  "} catch { Write-Host ('  [X] ' + $_.Exception.Message); exit 1 }"

if errorlevel 1 goto :fallo
echo.
echo  Listo. Ya tenes el icono de MV Agendate IA en el escritorio
echo  y en el menu Inicio. Abrilo desde ahi cuando quieras.
echo.
pause
exit /b 0

:fallo
echo.
echo  No se pudieron crear los accesos directos ^(suele ser una politica de la
echo  empresa que bloquea PowerShell^). No pasa nada: el programa funciona igual
echo  abriendo Iniciar-MV-Agendate.bat desde esta carpeta.
echo.
pause
exit /b 1
