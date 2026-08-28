/**
 * Cómo se contacta a un humano de Platlia.
 *
 * Estaba escrito una sola vez, suelto dentro del `href` de la calculadora de
 * precios de la portada, y por eso la pantalla de licencia vencida —el único
 * lugar donde alguien de verdad necesita hablar con alguien— no ofrecía ningún
 * contacto: la salida era pagar o cerrar sesión.
 *
 * Módulo puro: lo usan tanto pantallas de servidor como de cliente.
 */

/** En formato internacional sin signos, como lo pide `wa.me`. */
export const WHATSAPP_SOPORTE = "573239249986";

/** Para mostrar. */
export const WHATSAPP_SOPORTE_VISIBLE = "+57 323 924 9986";

/**
 * El correo de contacto y soporte.
 *
 * Vive acá por lo mismo que el teléfono: estaba escrito a mano en la portada y
 * en el pie, así que cambiarlo era acordarse de dos lugares. No es el de habeas
 * data —`protecciondatos@platlia.com`—, que es una dirección legal aparte y no
 * se toca desde acá.
 */
export const CORREO_SOPORTE = "contacto@platlia.com";

/**
 * Un enlace de WhatsApp con el mensaje ya escrito.
 *
 * El texto previo importa: quien escribe desde una pantalla de licencia vencida
 * no tiene por qué explicar quién es ni qué le pasa, y del otro lado se atiende
 * más rápido si el mensaje ya trae el nombre del negocio.
 */
export function enlaceWhatsapp(mensaje: string): string {
  return `https://wa.me/${WHATSAPP_SOPORTE}?text=${encodeURIComponent(mensaje)}`;
}
