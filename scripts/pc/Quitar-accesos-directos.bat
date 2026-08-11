@echo off
title MV Agendate IA - quitar accesos directos
cd /d "%~dp0"

REM El "desinstalador" de la version portable. No hay nada instalado en el
REM sistema: solo borra los dos accesos directos que creo
REM Crear-acceso-directo.bat. Para terminar de sacar el programa, borra esta
REM carpeta a mano.
REM
REM Ojo: tus datos (agenda, clientes, precios) viven en la subcarpeta data\ de
REM esta misma carpeta. Si la borras, se van con ella — copiala antes si la
REM queres guardar.

echo.
echo  Quitando el icono del escritorio y del menu Inicio...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$sitios = @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'));" ^
  "foreach ($sitio in $sitios) {" ^
  "  $lnk = Join-Path $sitio 'MV Agendate IA.lnk';" ^
  "  if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host ('  [OK] quitado de ' + $sitio) }" ^
  "}"

echo.
echo  Listo. El programa en si sigue en esta carpeta: borrala si no lo queres mas.
echo  (Antes copiate la subcarpeta data\ si queres conservar tu agenda.)
echo.
pause
exit /b 0
