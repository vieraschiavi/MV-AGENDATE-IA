# 🔑 ¿Dónde va la API key de Claude? (APK y PC)

**Respuesta corta:** la API key va **SOLO en el programa de PC (el servidor)**.
La **APK NO lleva la key** — se conecta al servidor de PC que sí la tiene. Así el
público (y hasta el celular) nunca la ven. Es lo más seguro.

## Cómo funciona (arquitectura)

```
   📱 APK Android                 💻 Programa PC (servidor)              ☁️ Claude
  (WebView, sin key)  ──────►   MV Agendate IA (servidor)                ──────►   (Anthropic)
                       internet   [ acá está TU API key ]      internet
```

- El **celular** solo muestra la app y le pide datos al servidor.
- El **servidor (PC)** es el que llama a Claude, con tu API key embebida.
- La key **nunca sale del servidor**: no viaja al celular ni al navegador del cliente.

## En el PROGRAMA DE PC: así embebés tu key (una vez)

En la carpeta del programa, abrí una consola y corré:

```
npm run embeber-clave
```

Te pide tu API key (`sk-ant-...`) y la guarda **ofuscada** en
`src/clave-embebida.b64`. Ese archivo viaja dentro del programa que vendés.
El comprador arranca el programa y funciona con IA, **sin ver la clave** (el
panel la muestra enmascarada). El costo de la IA queda incluido en tu precio.

> Alternativas equivalentes: al arrancar el programa (`INICIAR.bat`) te la pide
> en la consola; o la cargás en `/config.html`; o la ponés en `.env` como
> `ANTHROPIC_API_KEY`. Cualquiera sirve — la de `embeber-clave` es la ideal para
> **vender** el producto ya listo.

## En la APK: NO se pone ninguna key

La APK es un contenedor liviano (WebView). Lo único que configura es **la
dirección del servidor** del profesional (con el engranaje ⚙️ o servida desde
el propio servidor en `/movil`). Toda la IA la resuelve el servidor. Por eso:

- ✅ La key nunca está en el teléfono → no se puede extraer del APK.
- ✅ Un mismo servidor (con una sola key tuya) atiende a todas las APKs/clientes.
- ✅ Si cambiás la key, la cambiás **una vez** en el servidor y listo.

## Resumen

| Dónde | ¿Lleva la API key? | Cómo se pone |
|---|---|---|
| **Programa PC (servidor)** | **Sí** | `npm run embeber-clave` (o `INICIAR.bat` / `/config.html` / `.env`) |
| **APK Android** | **No** | Solo se apunta al servidor (⚙️). La key queda en el servidor. |

> El archivo `src/clave-embebida.b64` **no se sube a git** (es tu clave privada).
> Generalo en tu copia antes de empaquetar y venderlo.
