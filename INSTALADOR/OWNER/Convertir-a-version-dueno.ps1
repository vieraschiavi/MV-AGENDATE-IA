# (c) 2026 Martin Viera. Todos los derechos reservados.
#
# Motor de deteccion de "Convertir-a-version-dueno.bat" (ver ese archivo: es
# el punto de entrada, este .ps1 hace el trabajo). Los dos tienen que viajar
# JUNTOS, en la misma carpeta.
#
# Busca TODAS las copias de MV Agendate IA instaladas en esta maquina -tanto
# la instalada con el .exe (oficial o demo) como la portable (.zip)- y las
# pasa a version DUENO: sin clave de licencia, sin limite de dias. No hace
# falta copiar nada a ningun lado: se puede correr desde el Escritorio, desde
# Descargas o desde un pendrive, porque la deteccion es automatica.
#
# COMO DETECTA CADA TIPO
#   - Instalada con el .exe: el instalador NSIS anota la carpeta en el
#     Registro de Windows (Agregar o quitar programas) aunque el cliente haya
#     elegido una carpeta distinta a la de por defecto. Se lee de ahi.
#   - Portable: no toca el registro (a proposito, ver INSTALADOR/README.md),
#     asi que se rastrea por el acceso directo que arma
#     "Crear-acceso-directo.bat" (si el cliente lo corrio) y, si no hay
#     acceso directo, por una busqueda acotada en las carpetas donde la gente
#     suele descomprimir un zip (Escritorio, Descargas, Documentos, la raiz
#     del usuario, la raiz de cada disco).
#   - Si nada de eso encuentra algo, se puede escribir la carpeta a mano, o
#     arrastrarla arriba del .bat.
#
# NO REPARTAS ESTE ARCHIVO NI EL .bat QUE LO LLAMA: entre los dos convierten
# cualquier copia instalada en la version completa, sin clave ni limite de
# dias. Es la llave maestra de tu propio producto.

param(
  [string]$RutaSugerida
)

$ErrorActionPreference = 'Stop'

function Escribir($t) { Write-Host $t }
function EscribirOk($t) { Write-Host $t -ForegroundColor Green }
function EscribirError($t) { Write-Host $t -ForegroundColor Red }
function EscribirAviso($t) { Write-Host $t -ForegroundColor Yellow }

# Agrega una carpeta candidata a la lista, sin repetir (compara la ruta
# normalizada, sin importar mayusculas ni la barra final).
function AgregarCandidato {
  param($Lista, $Carpeta, $Etiqueta)
  if (-not $Carpeta) { return }
  $normal = $Carpeta.TrimEnd('\', '/')
  if (-not (Test-Path -LiteralPath $normal)) { return }
  foreach ($existente in $Lista) {
    if ($existente.Carpeta -ieq $normal) { return }
  }
  $Lista.Add([pscustomobject]@{ Carpeta = $normal; Etiqueta = $Etiqueta })
}

# Decide si una carpeta es una instalacion valida y, si lo es, que tipo:
#   - "instalado": el .exe (electron-builder deja los archivos bajo
#     resources\app\ adentro de la carpeta de instalacion).
#   - "portable": el paquete .zip (los archivos estan sueltos, sin
#     resources\app\, porque no pasa por Electron).
# Prueba las dos formas posibles con la MISMA carpeta: sirve tanto si le
# paso la raiz de la instalacion como si le paso resources\app directo (por
# si alguien pega esa ruta a mano).
function ClasificarCandidato {
  param($Carpeta)
  $opciones = @($Carpeta, (Join-Path $Carpeta 'resources\app'))
  foreach ($base in $opciones) {
    $cfg = Join-Path $base 'electron\owner-config.cjs'
    $dias = Join-Path $base 'src\store\dias-prueba.js'
    if (Test-Path -LiteralPath $dias) {
      if (Test-Path -LiteralPath $cfg) {
        return [pscustomobject]@{ Tipo = 'instalado'; Base = $base; Cfg = $cfg; Dias = $dias }
      }
      return [pscustomobject]@{ Tipo = 'portable'; Base = $base; Cfg = $null; Dias = $dias }
    }
  }
  return $null
}

Escribir ''
Escribir ' ================================================'
Escribir '  MV Agendate IA - pasar a version DUENO'
Escribir ' ================================================'
Escribir ''
Escribir ' Buscando copias instaladas en esta maquina...'

$candidatos = New-Object System.Collections.Generic.List[object]

# ---------- 1) Registro de Windows: lo que se instalo con el .exe ----------
# El instalador es "perMachine:false" (se instala para el usuario actual,
# sin pedir admin), asi que HKCU es lo normal; se revisan tambien las otras
# dos por si alguna vez se instala como admin o en un Windows de 32 bits.
$clavesRegistro = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
)
foreach ($clave in $clavesRegistro) {
  Get-ChildItem -Path $clave -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $item = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
      if ($item -and $item.DisplayName -and $item.InstallLocation) {
        if ($item.DisplayName -like 'MV Agendate IA*') {
          AgregarCandidato $candidatos $item.InstallLocation $item.DisplayName
        }
      }
    } catch { }
  }
}

# ---------- 2) Accesos directos del portable (Escritorio y menu Inicio) ----------
# Los crea (si el cliente los pidio) "Crear-acceso-directo.bat" con el mismo
# nombre "MV Agendate IA.lnk" que usa tambien el instalador .exe -por eso hay
# que mirar A DONDE apunta, no alcanza con que exista.
try {
  $shell = New-Object -ComObject WScript.Shell
  $rutasAcceso = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'MV Agendate IA.lnk'),
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\MV Agendate IA.lnk')
  )
  foreach ($lnk in $rutasAcceso) {
    if (Test-Path -LiteralPath $lnk) {
      try {
        $destino = $shell.CreateShortcut($lnk).TargetPath
        if ($destino) {
          $carpetaDestino = Split-Path $destino -Parent
          $nombreDestino = Split-Path $destino -Leaf
          if ($nombreDestino -ieq 'Iniciar-MV-Agendate.bat') {
            AgregarCandidato $candidatos $carpetaDestino 'MV Agendate IA (portable, por acceso directo)'
          } elseif ($nombreDestino -ieq 'MV Agendate IA.exe') {
            AgregarCandidato $candidatos $carpetaDestino 'MV Agendate IA (por acceso directo)'
          }
        }
      } catch { }
    }
  }
} catch {
  EscribirAviso ' No pude revisar los accesos directos (sigo con lo demas).'
}

# ---------- 3) Ruta pasada como argumento (arrastrada sobre el .bat) ----------
if ($RutaSugerida) {
  $rutaLimpia = $RutaSugerida.Trim('"')
  if (Test-Path -LiteralPath $rutaLimpia) {
    $item = Get-Item -LiteralPath $rutaLimpia
    $carpetaArg = if ($item.PSIsContainer) { $item.FullName } else { $item.DirectoryName }
    AgregarCandidato $candidatos $carpetaArg 'ruta indicada'
  }
}

# ---------- 4) La carpeta desde donde se corre este script ----------
# Compatibilidad con la forma de usarlo de siempre: copiarlo A la carpeta
# donde quedo instalado el programa.
if ($PSScriptRoot) {
  AgregarCandidato $candidatos $PSScriptRoot 'esta carpeta'
  AgregarCandidato $candidatos (Split-Path $PSScriptRoot -Parent) 'la carpeta de arriba'
}

# ---------- 5) Rastreo acotado (portable sin acceso directo) ----------
# Solo en las carpetas donde la gente suele descomprimir un .zip. Nada de
# recorrer el disco entero: en la raiz de cada disco se mira solo el primer
# nivel (pensado para un pendrive), y en Escritorio/Descargas/Documentos se
# baja un par de niveles porque son carpetas chicas.
$raicesChicas = New-Object System.Collections.Generic.List[string]
foreach ($carpetaEspecial in @('Desktop', 'MyDocuments')) {
  try {
    $p = [Environment]::GetFolderPath($carpetaEspecial)
    if ($p) { $raicesChicas.Add($p) }
  } catch { }
}
$descargas = Join-Path $env:USERPROFILE 'Downloads'
if (Test-Path -LiteralPath $descargas) { $raicesChicas.Add($descargas) }

foreach ($raiz in ($raicesChicas | Select-Object -Unique)) {
  try {
    Get-ChildItem -LiteralPath $raiz -Filter 'MV-Agendate-IA*' -Directory -Recurse -Depth 2 -ErrorAction SilentlyContinue |
      ForEach-Object { AgregarCandidato $candidatos $_.FullName 'carpeta encontrada' }
  } catch { }
}

if ($env:USERPROFILE -and (Test-Path -LiteralPath $env:USERPROFILE)) {
  try {
    Get-ChildItem -LiteralPath $env:USERPROFILE -Filter 'MV-Agendate-IA*' -Directory -ErrorAction SilentlyContinue |
      ForEach-Object { AgregarCandidato $candidatos $_.FullName 'carpeta encontrada' }
  } catch { }
}

try {
  Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      Get-ChildItem -LiteralPath $_.Root -Filter 'MV-Agendate-IA*' -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { AgregarCandidato $candidatos $_.FullName 'carpeta encontrada (disco)' }
    } catch { }
  }
} catch { }

# ---------- Clasificar y quedarse con las que de verdad son MV Agendate IA ----------
$listos = New-Object System.Collections.Generic.List[object]
$vistos = @{}
foreach ($cand in $candidatos) {
  $clasif = ClasificarCandidato $cand.Carpeta
  if (-not $clasif) { continue }
  $claveUnica = $clasif.Base.ToLowerInvariant().TrimEnd('\', '/')
  if ($vistos.ContainsKey($claveUnica)) { continue }
  $vistos[$claveUnica] = $true
  $yaDueno = $false
  try {
    $yaDueno = [bool](Select-String -LiteralPath $clasif.Dias -Pattern 'DIAS_FIJADOS\s*=\s*0' -Quiet -ErrorAction SilentlyContinue)
  } catch { }
  $listos.Add([pscustomobject]@{
    Carpeta  = $cand.Carpeta
    Etiqueta = $cand.Etiqueta
    Tipo     = $clasif.Tipo
    Cfg      = $clasif.Cfg
    Dias     = $clasif.Dias
    YaDueno  = $yaDueno
  })
}

# ---------- Si no encontro nada solo, pedirlo a mano ----------
if ($listos.Count -eq 0) {
  Escribir ''
  EscribirAviso ' No encontre ninguna copia instalada sola.'
  Escribir ''
  Escribir ' Pega la carpeta donde quedo instalado el programa (la que tiene'
  Escribir ' "MV Agendate IA.exe", o para el portable la que tiene'
  Escribir ' "Iniciar-MV-Agendate.bat"). Tip: clic derecho en el acceso'
  Escribir ' directo del escritorio - Abrir ubicacion del archivo.'
  Escribir ''
  $rutaManual = Read-Host ' Carpeta (Enter para cancelar)'
  if (-not $rutaManual) {
    Escribir ''
    Escribir ' Cancelado, no se toco nada.'
    Read-Host ' (Enter para salir)'
    exit 1
  }
  $rutaManual = $rutaManual.Trim().Trim('"')
  if (-not (Test-Path -LiteralPath $rutaManual)) {
    EscribirError ' No encuentro esa carpeta.'
    Read-Host ' (Enter para salir)'
    exit 1
  }
  $clasifManual = ClasificarCandidato $rutaManual
  if (-not $clasifManual) {
    EscribirError ' Esa carpeta no parece tener MV Agendate IA adentro.'
    EscribirError ' (no encontre src\store\dias-prueba.js ni ahi ni en resources\app)'
    Read-Host ' (Enter para salir)'
    exit 1
  }
  $yaDuenoManual = $false
  try {
    $yaDuenoManual = [bool](Select-String -LiteralPath $clasifManual.Dias -Pattern 'DIAS_FIJADOS\s*=\s*0' -Quiet -ErrorAction SilentlyContinue)
  } catch { }
  $listos.Add([pscustomobject]@{
    Carpeta  = $rutaManual
    Etiqueta = 'ruta indicada a mano'
    Tipo     = $clasifManual.Tipo
    Cfg      = $clasifManual.Cfg
    Dias     = $clasifManual.Dias
    YaDueno  = $yaDuenoManual
  })
}

# ---------- Elegir cual convertir ----------
Escribir ''
Escribir (' Encontre {0} copia(s):' -f $listos.Count)
Escribir ''
for ($i = 0; $i -lt $listos.Count; $i++) {
  $l = $listos[$i]
  $estado = if ($l.YaDueno) { 'ya en version DUENO' } else { 'version normal, con prueba' }
  Escribir (' [{0}] {1}' -f ($i + 1), $l.Carpeta)
  Escribir ('     {0} - {1}' -f $l.Tipo, $estado)
}
Escribir ''

$elegidos = @()
if ($listos.Count -eq 1) {
  $resp = Read-Host ' Convertir esta copia a version DUENO? [S/n]'
  if (-not $resp -or $resp.Trim().ToLower() -ne 'n') { $elegidos = @(0) }
} else {
  Escribir ' Escribi el numero de la que queres convertir, T para TODAS, o Enter para cancelar.'
  $resp = Read-Host ' Elegis'
  $resp = $resp.Trim()
  if ($resp.ToUpper() -eq 'T') {
    $elegidos = 0..($listos.Count - 1)
  } elseif ($resp -match '^\d+$' -and [int]$resp -ge 1 -and [int]$resp -le $listos.Count) {
    $elegidos = @([int]$resp - 1)
  }
}

if ($elegidos.Count -eq 0) {
  Escribir ''
  Escribir ' No se convirtio nada.'
  Read-Host ' (Enter para salir)'
  exit 0
}

# ---------- Aplicar el cambio a cada una elegida ----------
foreach ($idx in $elegidos) {
  $l = $listos[$idx]
  Escribir ''
  Escribir (' -- {0} --' -f $l.Carpeta)

  if ($l.YaDueno) {
    $origDias = "$($l.Dias).original"
    if (-not (Test-Path -LiteralPath $origDias)) {
      EscribirAviso '   Ya esta en version DUENO, pero no tengo la copia .original para volver atras.'
      EscribirAviso '   Si necesitas la version con prueba, reinstala con el instalador normal.'
      continue
    }
    $volver = Read-Host '   Ya esta en version DUENO. Volverla a la normal, con prueba? [s/N]'
    if (-not $volver -or $volver.Trim().ToLower() -ne 's') {
      Escribir '   Sin cambios.'
      continue
    }
    try {
      Copy-Item -LiteralPath $origDias -Destination $l.Dias -Force
      if ($l.Cfg) {
        $origCfg = "$($l.Cfg).original"
        if (Test-Path -LiteralPath $origCfg) { Copy-Item -LiteralPath $origCfg -Destination $l.Cfg -Force }
      }
      EscribirOk '   [OK] Volvio a la version normal, con su prueba de dias.'
    } catch {
      EscribirError ('   [X] No pude escribir ahi: {0}' -f $_.Exception.Message)
    }
    continue
  }

  try {
    if (-not (Test-Path -LiteralPath "$($l.Dias).original")) {
      Copy-Item -LiteralPath $l.Dias -Destination "$($l.Dias).original" -Force
    }
    if ($l.Cfg -and -not (Test-Path -LiteralPath "$($l.Cfg).original")) {
      Copy-Item -LiteralPath $l.Cfg -Destination "$($l.Cfg).original" -Force
    }

    # Mismo contenido que fija scripts/variante-instalador.js para la
    # variante --owner (diasPrueba: 0 / DIAS_FIJADOS = 0): ver
    # test/convertir-owner.test.js, que compara los dos literalmente.
    Set-Content -LiteralPath $l.Dias -Encoding ascii -Value @(
      'export const DIAS_PRUEBA_CLIENTE = 7;'
      'export const DIAS_FIJADOS = 0;'
    )
    if ($l.Cfg) {
      Set-Content -LiteralPath $l.Cfg -Encoding ascii -Value 'module.exports = { diasPrueba: 0 };'
    }
    EscribirOk '   [OK] Convertida a version DUENO: sin clave, sin limite de dias.'
  } catch {
    EscribirError ('   [X] No pude escribir ahi: {0}' -f $_.Exception.Message)
    EscribirAviso '       Suele ser una de estas:'
    EscribirAviso '       - El programa esta abierto: cerralo y proba de nuevo.'
    EscribirAviso '       - El antivirus bloquea la escritura en esa carpeta.'
    EscribirAviso '       - Se instalo en "Archivos de programa" y hace falta'
    EscribirAviso '         correr esto como administrador.'
  }
}

Escribir ''
Escribir ' Listo. Cerra y volve a abrir MV Agendate IA en cada copia que hayas tocado:'
Escribir ' el motor lee estos archivos al arrancar.'
Escribir ''
Read-Host ' (Enter para salir)'
exit 0
