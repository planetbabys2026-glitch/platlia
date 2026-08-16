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
export const WHATSAPP_SOPORTE = "573105742111";

/** Para mostrar. */
export const WHATSAPP_SOPORTE_VISIBLE = "+57 310 574 2111";

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
