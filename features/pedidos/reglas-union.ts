/**
 * Unir varias cuentas en una sola.
 *
 * Llega un grupo, se reparte en tres mesas, y al final una persona paga todo. Sin
 * esto hay que cobrar tres veces, dar tres tiquetes y sumar a mano; y si pidieron
 * factura electrónica, son tres documentos ante la DIAN por una sola venta.
 *
 * Unir es MUDAR LOS RENGLONES a una cuenta destino y dejar las origen marcadas
 * como unidas. No es "cobrar juntas": el resultado es un pedido de verdad, con su
 * consecutivo, su comanda y su tiquete, que es lo que después se factura.
 *
 * Puro y con tests, por lo mismo de siempre: la acción es un POST alcanzable con
 * curl y la pantalla no puede ofrecer un botón que el servidor va a rechazar.
 */

export type CuentaParaUnir = {
  id: string;
  code: number;
  status: string;
  /** Lo ya cobrado. Un pago atribuido no puede mudarse de cuenta. */
  paidCop: number;
  /** Si ya tiene documento ante la DIAN. */
  facturada: boolean;
  /** Los domicilios no se unen: cada uno tiene su dirección y su reparto. */
  esDomicilio: boolean;
};

export type MotivoNoUnion =
  | "MUY_POCAS"
  | "DESTINO_AJENO"
  | "CUENTA_CERRADA"
  | "CON_PAGOS"
  | "FACTURADA"
  | "ES_DOMICILIO";

export type ResultadoUnion =
  | { ok: true; destino: CuentaParaUnir; origenes: CuentaParaUnir[] }
  | { ok: false; motivo: MotivoNoUnion; cuenta?: CuentaParaUnir };

/**
 * Qué se puede unir y en cuál.
 *
 * El destino tiene que ser una de las cuentas elegidas: unir hacia una cuenta que
 * no está en la lista sería mover renglones a un pedido que quien aprieta el botón
 * no está mirando.
 *
 * Las tres prohibiciones son de plata, no de prolijidad:
 *
 * - **Con pagos.** Un `OrderPayment` está atado a un pedido y a una caja. Mudar
 *   los renglones dejaría el pago cobrando una cuenta vacía y el arqueo de esa
 *   caja sin nada contra qué explicarlo.
 * - **Facturada.** Una factura emitida no se borra, se corrige con nota crédito.
 *   Vaciarle los renglones deja viva ante la DIAN una factura que ya no describe
 *   ninguna venta.
 * - **Domicilio.** Tiene dirección, tarifa de envío y un recorrido propio. Unir
 *   dos es preguntarse a cuál de las dos direcciones va la moto.
 */
export function puedenUnirse(
  cuentas: readonly CuentaParaUnir[],
  destinoId: string,
): ResultadoUnion {
  if (cuentas.length < 2) return { ok: false, motivo: "MUY_POCAS" };

  const destino = cuentas.find((c) => c.id === destinoId);
  if (!destino) return { ok: false, motivo: "DESTINO_AJENO" };

  for (const cuenta of cuentas) {
    if (cuenta.status !== "ABIERTA" && cuenta.status !== "CUENTA_PEDIDA") {
      return { ok: false, motivo: "CUENTA_CERRADA", cuenta };
    }
    if (cuenta.paidCop > 0) return { ok: false, motivo: "CON_PAGOS", cuenta };
    if (cuenta.facturada) return { ok: false, motivo: "FACTURADA", cuenta };
    if (cuenta.esDomicilio) return { ok: false, motivo: "ES_DOMICILIO", cuenta };
  }

  return { ok: true, destino, origenes: cuentas.filter((c) => c.id !== destinoId) };
}

/** El texto que ve quien intentó unir. */
export function mensajeDeUnion(motivo: MotivoNoUnion, cuenta?: CuentaParaUnir): string {
  const cual = cuenta ? `La cuenta #${cuenta.code}` : "Una de las cuentas";
  switch (motivo) {
    case "MUY_POCAS":
      return "Elegí al menos dos cuentas para unir.";
    case "DESTINO_AJENO":
      return "La cuenta que recibe tiene que ser una de las elegidas.";
    case "CUENTA_CERRADA":
      return `${cual} ya está cerrada.`;
    case "CON_PAGOS":
      return `${cual} ya tiene un pago recibido: cobrala aparte o anulá el pago antes de unir.`;
    case "FACTURADA":
      return `${cual} ya tiene factura electrónica emitida y no se puede unir.`;
    case "ES_DOMICILIO":
      return "Los domicilios no se unen: cada uno tiene su dirección y su envío.";
  }
}
