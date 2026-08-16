/**
 * Reglas para leer un error del navegador. Puras, sin `server-only`: las usa el
 * límite de error, que es un componente cliente.
 */

/**
 * Distingue "hay una versión nueva" de "algo está roto".
 *
 * Cada despliegue cambia el hash de los trozos de JavaScript. Quien tenía la
 * aplicación abierta —la tablet del salón, que no se recarga en toda la noche—
 * sigue con el HTML anterior y pide archivos que ya no están en el servidor. El
 * navegador tira `ChunkLoadError` y la pantalla muestra "algo salió mal", con un
 * botón de reintentar que vuelve a montar el mismo árbol, vuelve a pedir el
 * mismo archivo que no existe y falla igual: se queda trabado.
 *
 * Reconocerlo permite hacer lo único que lo arregla, que es recargar.
 *
 * Los tres mensajes cubren lo que tira cada empaquetador: `ChunkLoadError` es el
 * nombre que usa webpack —el bundler de este build—, el "Loading chunk … failed"
 * es su mensaje, y el de `import()` dinámico aparece cuando el módulo se pide por
 * ESM. Se comparan sin distinguir mayúsculas porque el texto no es una API y ya
 * cambió de forma entre versiones.
 */
export function esVersionVieja(error: { name?: string; message?: string } | null): boolean {
  if (!error) return false;

  const mensaje = error.message ?? "";
  return (
    error.name === "ChunkLoadError" ||
    /loading chunk .* failed/i.test(mensaje) ||
    /failed to fetch dynamically imported module/i.test(mensaje) ||
    /error loading dynamically imported module/i.test(mensaje)
  );
}
