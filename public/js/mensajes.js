// © 2026 Martín Viera. Todos los derechos reservados.
// Único punto de verdad para pintar un mensaje de chat (chatbot demo, widget
// embebible) en el DOM. La regla de seguridad es simple pero fácil de romper
// sin querer: el texto de un mensaje puede venir del cliente final o del
// modelo de IA — nunca hay que insertarlo con innerHTML. `textContent` no
// interpreta HTML bajo ninguna circunstancia, así que es la única forma
// correcta de mostrarlo.
//
// Por qué existe este archivo en vez de repetir `div.textContent = texto` en
// cada página: si mañana alguien "mejora" el chat para que se vea el emoji
// bien y cambia esto a innerHTML, el cambio queda en UN solo lugar con UN
// test de regresión (test/mensajes.test.js) que lo agarra antes de llegar a
// producción — no una reescritura suelta en demo.html que nadie revisa con
// ojo de seguridad.
//
// Sin import/export a propósito (mismo criterio que seguro.js): se carga
// como script clásico y se prueba importándolo por su efecto secundario.
(function (global) {
  /**
   * Crea un mensaje de chat seguro dentro de `contenedor`.
   * @param {Element} contenedor
   * @param {string} texto — dato ajeno (cliente final o IA): SIEMPRE texto, nunca HTML.
   * @param {string} [className] — clases CSS del mensaje (ej. "msg user").
   * @returns {Element} el div creado
   */
  function agregarMensaje(contenedor, texto, className) {
    const div = global.document.createElement('div');
    if (className) div.className = className;
    div.textContent = texto;
    contenedor.appendChild(div);
    contenedor.scrollTop = contenedor.scrollHeight;
    return div;
  }
  global.agregarMensaje = agregarMensaje;
})(typeof window !== 'undefined' ? window : globalThis);
