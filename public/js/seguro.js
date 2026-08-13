// © 2026 Martín Viera. Todos los derechos reservados.

// Escape HTML centralizado — la única función que debe usarse en public/ para
// insertar en el DOM cualquier dato que no sea texto propio hardcodeado:
// respuestas de la API, texto redactado por el modelo de IA, nombres que carga
// el profesional o el cliente final, parámetros de la URL.
//
// Antes cada página (config.html, demo.html, index.html, resenas-admin.html)
// tenía su propia copia de esta función — con el riesgo de que una quedara
// desactualizada o un caracter sin cubrir en una sola de ellas. Ahora hay una
// sola implementación, importada por todas, y un test de regresión
// (test/seguro.test.js) que la prueba contra una batería de payloads XSS.
//
// Se usa igual para contenido de texto que para valores de atributos: escapar
// las cinco entidades de abajo alcanza para los dos contextos (rompe tanto
// una etiqueta como una comilla de atributo).
//
// Sin `import`/`export`: así se puede cargar como script clásico
// (`<script src="/js/seguro.js">`, igual que i18n.js/contacto.js — se ejecuta
// en orden, sin la espera de un módulo diferido) y también importarlo por su
// efecto secundario desde los tests de Node (ver test/seguro.test.js).
(function (global) {
  function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }
  global.escaparHtml = escaparHtml;
})(typeof window !== 'undefined' ? window : globalThis);
