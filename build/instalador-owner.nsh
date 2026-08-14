; (c) 2026 Martin Viera. Todos los derechos reservados.
; Software propietario. Uso sujeto a LICENSE.
;
; Variante OWNER del instalador: el MISMO payload que el de clientes, sellado
; como edicion del dueno al instalar. El sello es un TOKEN FIRMADO (Ed25519)
; con la clave del dueno de los productos MV -- no un flag compilado ni un
; JSON que cualquiera pueda escribir. Lo lee src/store/sello-owner.js.
;
; Con asar:false el codigo queda en $INSTDIR\resources\app\, asi que la
; carpeta de datos junto al codigo es resources\app\data.
!macro customInstall
  CreateDirectory "$INSTDIR\resources\app\data"
  FileOpen $0 "$INSTDIR\resources\app\data\licencia-owner.json" w
  FileWrite $0 '{"token": "MV1.eyJ0aXBvIjoib3duZXIiLCJlbWl0aWRvIjoiMjAyNi0wOC0xMlQxMzoxNTozNy45NDZaIn0.9C9cqjUqhWwKxwAjh_uFZtaxOXvb7ddYj3ZVHD_4tXo8KCc5uJzRwNyfa256gyChILx9gYVb7-B9-_5OhpC3AQ"}'
  FileClose $0
!macroend

; Al desinstalar se borra el sello: una instalacion futura de otra persona en
; la misma carpeta no puede heredar la edicion del dueno.
!macro customUnInstall
  Delete "$INSTDIR\resources\app\data\licencia-owner.json"
!macroend
