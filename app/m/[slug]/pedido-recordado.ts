/**
 * El pedido que este teléfono acaba de hacer, para no perderlo al recargar.
 *
 * Sin esto, cualquier recarga —un tirón hacia abajo sin querer, quedarse sin
 * señal, cambiar de app y volver— borraba el rastreo, y el cliente tenía que
 * acordarse de su número y volver a buscarlo.
 *
 * **Por qué no interfiere entre personas.** `localStorage` es del navegador, así
 * que dos comensales que escanean el mismo QR desde sus propios teléfonos no
 * comparten nada. El caso que sí podría cruzarse es un aparato prestado —una
 * tablet del local que pasa de mesa en mesa— y para ése está la ventana de
 * vigencia: pasadas unas horas el recuerdo se descarta solo, mucho antes de que
 * ese mismo aparato lo use otra persona en otro turno.
 *
 * Se guarda solo el id del pedido, nunca el teléfono ni la dirección: si alguien
 * después mira ese teléfono, no encuentra los datos de nadie.
 */

/** Cuánto dura el recuerdo. Una comida larga entra; el turno siguiente, no. */
export const VIGENCIA_MS = 4 * 60 * 60 * 1000;

type Recordado = { orderId: string; guardadoEn: number };

/** Una llave por negocio: dos QR distintos no se pisan en el mismo teléfono. */
function clave(slug: string): string {
  return `platlia_qr_pedido_${slug}`;
}

export function recordarPedido(slug: string, orderId: string): void {
  try {
    const dato: Recordado = { orderId, guardadoEn: Date.now() };
    localStorage.setItem(clave(slug), JSON.stringify(dato));
  } catch {
    // Modo privado o almacenamiento lleno: no recordar es peor experiencia, no
    // un error. El pedido ya está hecho y se puede buscar por teléfono.
  }
}

export function olvidarPedido(slug: string): void {
  try {
    localStorage.removeItem(clave(slug));
  } catch {}
}

/**
 * El pedido recordado, si todavía está dentro de la ventana.
 *
 * Devuelve null —y limpia— cuando venció. El servidor además solo busca pedidos
 * del día de negocio en curso, así que un id viejo tampoco resolvería: son dos
 * defensas para lo mismo, y la de acá evita el viaje al servidor.
 */
export function pedidoRecordado(slug: string, ahora: number = Date.now()): string | null {
  try {
    const crudo = localStorage.getItem(clave(slug));
    if (!crudo) return null;

    const dato = JSON.parse(crudo) as Partial<Recordado>;
    if (typeof dato.orderId !== "string" || typeof dato.guardadoEn !== "number") {
      olvidarPedido(slug);
      return null;
    }

    if (ahora - dato.guardadoEn > VIGENCIA_MS) {
      olvidarPedido(slug);
      return null;
    }

    return dato.orderId;
  } catch {
    return null;
  }
}
