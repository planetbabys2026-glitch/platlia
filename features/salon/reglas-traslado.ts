/**
 * Trasladar una cuenta de mesa.
 *
 * El comensal se cambia de mesa —le da el sol, se suma gente, la de al lado tiene
 * enchufe— y la cuenta tiene que irse con él. Hasta acá no había forma: se cerraba
 * sin consumo y se volvía a tomar todo, o el mesero cantaba una mesa y el sistema
 * decía otra. Lo segundo es peor, porque la comanda ya salió a cocina.
 *
 * Las reglas viven acá, puras y con tests, por lo de siempre: la acción es un POST
 * alcanzable con curl, y la pantalla tiene que poder aplicar las mismas para no
 * ofrecer un botón que el servidor va a rechazar.
 */

export type PedidoParaTrasladar = {
  status: string;
  /** Null en un pedido sin mesa: para llevar, mostrador, domicilio. */
  tableId: string | null;
  /** Un domicilio no se traslada a una mesa: no está en el local. */
  esDomicilio: boolean;
};

export type MesaDestino = {
  id: string;
  status: string;
  archivada: boolean;
};

export type MotivoNoTraslado =
  | "PEDIDO_CERRADO"
  | "ES_DOMICILIO"
  | "MISMA_MESA"
  | "MESA_INEXISTENTE"
  | "MESA_INACTIVA";

export type ResultadoTraslado = { ok: true } | { ok: false; motivo: MotivoNoTraslado };

/**
 * Una cuenta se traslada a una mesa que **puede estar ocupada**: el modelo ya
 * admite varias cuentas por mesa, así que juntar dos grupos en una es legítimo y
 * es justamente lo que pasa cuando se corren para hacer lugar. Lo que no se
 * permite es mandarla a una mesa archivada o dada de baja, que dejaría la cuenta
 * colgada de algo que el salón no dibuja.
 *
 * `RESERVADA` sí se permite: la reserva es una intención, y si el grupo llegó y
 * se sentó ahí, la mesa está ocupada de verdad. Rechazarlo obligaría a ir a
 * Administración a cambiarle el estado con la gente ya sentada.
 */
export function puedeTrasladarse(
  pedido: PedidoParaTrasladar,
  destino: MesaDestino | null,
): ResultadoTraslado {
  if (pedido.status !== "ABIERTA" && pedido.status !== "CUENTA_PEDIDA") {
    return { ok: false, motivo: "PEDIDO_CERRADO" };
  }
  if (pedido.esDomicilio) return { ok: false, motivo: "ES_DOMICILIO" };
  if (!destino || destino.archivada) return { ok: false, motivo: "MESA_INEXISTENTE" };
  if (destino.id === pedido.tableId) return { ok: false, motivo: "MISMA_MESA" };
  if (destino.status === "INACTIVA") return { ok: false, motivo: "MESA_INACTIVA" };

  return { ok: true };
}

/** El texto que ve quien intentó el traslado. */
export function mensajeDeTraslado(motivo: MotivoNoTraslado, nombreMesa?: string): string {
  switch (motivo) {
    case "PEDIDO_CERRADO":
      return "Esta cuenta ya está cerrada: no se puede trasladar.";
    case "ES_DOMICILIO":
      return "Un domicilio no se traslada a una mesa.";
    case "MISMA_MESA":
      return "La cuenta ya está en esa mesa.";
    case "MESA_INEXISTENTE":
      return "Esa mesa no existe.";
    case "MESA_INACTIVA":
      return nombreMesa
        ? `La mesa ${nombreMesa} está fuera de servicio.`
        : "Esa mesa está fuera de servicio.";
  }
}
