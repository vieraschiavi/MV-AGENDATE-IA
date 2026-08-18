; © 2026 Martín Viera. Todos los derechos reservados.
;
; Personalización del instalador NSIS. electron-builder toma este archivo solo
; por existir en build/installer.nsh — no hay que declararlo en package.json.
;
; QUÉ RESUELVE
; El instalador asistido (oneClick:false + allowToChangeInstallationDirectory)
; deja que el cliente elija carpeta y disco. Si al actualizar elige una carpeta
; DISTINTA de la vez anterior, la instalación vieja queda entera: dos entradas
; en "Agregar o quitar programas", dos accesos directos y dos copias del
; programa ocupando disco. Peor todavía, el acceso directo viejo sigue abriendo
; la versión vieja, así que el cliente actualiza y "no le cambia nada".
;
; Por eso la desinstalación previa se hace acá a mano: se busca dónde quedó
; instalada la versión anterior (InstallLocation del registro, no la carpeta
; que el cliente eligió ahora) y se corre SU desinstalador desde ahí.

; Carpeta que viene propuesta en la pantalla "Elegir ubicación".
;
; Por defecto electron-builder propone %LOCALAPPDATA%\Programs\... — siempre en
; C: y enterrado en AppData, una carpeta que el cliente no reconoce. Peor al
; actualizar: si la primera vez eligió D:\Programas, la segunda le vuelve a
; proponer C: y termina con la app en dos discos.
;
; Acá se propone la carpeta donde YA está instalada, si la hay. El cliente
; sigue pudiendo cambiarla (allowToChangeInstallationDirectory), pero la
; propuesta deja de ser una sorpresa.
;
; No se fuerza otro disco a dedo: D: puede no existir, o ser un pendrive que
; hoy está y mañana no, y ahí el programa deja de abrir.
!macro preInit
  ReadRegStr $R6 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $R6 == ""
    ReadRegStr $R6 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${EndIf}
  ${If} $R6 != ""
  ${AndIf} ${FileExists} "$R6\*.*"
    StrCpy $INSTDIR "$R6"
  ${EndIf}
!macroend

!macro customInit
  ; Se mira primero HKCU porque la instalación es por usuario (perMachine:false),
  ; y después HKLM por si alguna copia vieja se instaló para toda la máquina.
  ReadRegStr $R7 HKCU "${INSTALL_REGISTRY_KEY}" "UninstallString"
  ReadRegStr $R8 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $R7 == ""
    ReadRegStr $R7 HKLM "${INSTALL_REGISTRY_KEY}" "UninstallString"
    ReadRegStr $R8 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${EndIf}

  ${If} $R7 != ""
  ${AndIf} $R8 != ""
    ; El programa puede estar abierto: si no se cierra, el desinstalador no
    ; puede borrar el .exe y la desinstalación queda a medias.
    nsExec::Exec 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}"'
    Pop $R9

    ; /S = silencioso (no le pedimos nada más al cliente: ya aceptó instalar).
    ; _?=<carpeta> es lo importante: sin eso NSIS copia el desinstalador al temp
    ; y vuelve enseguida, así que el instalador seguiría copiando archivos
    ; MIENTRAS la desinstalación todavía corre — y termina borrando lo recién
    ; instalado. Con _?= el desinstalador corre en su carpeta y ExecWait espera
    ; de verdad a que termine.
    ExecWait '"$R7" /S _?=$R8' $R9

    ; El desinstalador se deja a sí mismo sin borrar cuando se lo llama con
    ; _?=; se limpia acá junto con la carpeta, que a esta altura quedó vacía
    ; (RMDir sin /r no borra nada si adentro quedó algo, así que no hay riesgo
    ; de llevarse datos por delante).
    Delete "$R7"
    RMDir "$R8"
  ${EndIf}
!macroend
