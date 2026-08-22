/**
 * Por dónde puede pasar un domicilio y por dónde no.
 *
 * Módulo puro y sin `server-only`: lo necesitan la Server Action —que es un POST
 * alcanzable con curl— y también la pantalla, para no ofrecer un botón que el
 * servidor va a rechazar. Y así tiene tests.
 *
 * Antes no había ninguna regla: `actualizarEstadoDomicilio` escribía el string
 * que le mandaran, así que un POST directo podía saltar de recién llegado a
 * entregado sin pasar por la cocina, y los tiempos que se miden entre estados
 * dejaban de significar algo.
 */

/** Los mismos valores del enum `DeliveryStatus` de Prisma. */
export type EstadoDomicilio =
  | "POR_CONFIRMAR"
  | "EN_PREPARACION"
  | "LISTO"
  | "EN_CAMINO"
  | "ENTREGADO"
  | "CANCELADO";

/**
 * El camino feliz, en orden.
 *
 * `LISTO` es el que faltaba: cocina terminó y la cuenta todavía no se cobró. Es
 * lo que hace que un domicilio aparezca en caja recién cuando hay algo que
 * cobrar, en vez de desde el momento en que el comensal toca "enviar".
 */
export const FLUJO_DOMICILIO = [
  "POR_CONFIRMAR",
  "EN_PREPARACION",
  "LISTO",
  "EN_CAMINO",
  "ENTREGADO",
] as const;

export const ETIQUETA_ESTADO: Record<EstadoDomicilio, string> = {
  POR_CONFIRMAR: "Por confirmar",
  EN_PREPARACION: "En cocina",
  LISTO: "Listo para despachar",
  EN_CAMINO: "En reparto",
  ENTREGADO: "Entregado",
  CANCELADO: "Anulado",
};

/**
 * Lo que dice el botón que lleva a ese estado.
 *
 * Separado de la etiqueta a propósito: "En cocina" describe dónde está, y
 * "Aceptar y pasar a cocina" describe lo que va a hacer el clic. Mezclarlos es
 * como se termina con un botón que dice un estado y hace otra cosa.
 */
export const ACCION_HACIA: Partial<Record<EstadoDomicilio, string>> = {
  EN_PREPARACION: "Aceptar y pasar a cocina",
  LISTO: "Marcar listo para despachar",
  EN_CAMINO: "Despachar a reparto",
  ENTREGADO: "Confirmar entrega al cliente",
};

/** Ya no se mueve más: no tiene sentido ofrecer nada. */
export function esFinal(estado: EstadoDomicilio): boolean {
  return estado === "ENTREGADO" || estado === "CANCELADO";
}

/** El paso natural que sigue, o null si ya terminó. */
export function siguienteEstado(estado: EstadoDomicilio): EstadoDomicilio | null {
  if (esFinal(estado)) return null;
  const i = FLUJO_DOMICILIO.indexOf(estado as (typeof FLUJO_DOMICILIO)[number]);
  if (i < 0 || i + 1 >= FLUJO_DOMICILIO.length) return null;
  return FLUJO_DOMICILIO[i + 1];
}

/**
 * Si se puede ir de un estado al otro.
 *
 * Solo se avanza de a un paso, y se puede anular desde cualquier lado menos
 * cuando ya se entregó —lo entregado no se deshace, se anula la venta con su
 * nota crédito—. No se vuelve atrás: si cocina se equivocó, se anula y se rehace.
 */
export function puedeAvanzar(desde: EstadoDomicilio, hacia: EstadoDomicilio): boolean {
  if (desde === hacia) return false;
  if (hacia === "CANCELADO") return desde !== "ENTREGADO";
  if (esFinal(desde)) return false;
  return siguienteEstado(desde) === hacia;
}

/**
 * Por qué no se puede, para decírselo a quien lo intentó.
 *
 * Devuelve null cuando sí se puede: se usa como guarda y como texto de error en
 * el mismo lugar, así que no pueden discrepar.
 */
export function motivoDelRechazo(
  desde: EstadoDomicilio,
  hacia: EstadoDomicilio,
): string | null {
  if (puedeAvanzar(desde, hacia)) return null;

  if (desde === hacia) return `El pedido ya está en "${ETIQUETA_ESTADO[hacia]}".`;
  if (desde === "ENTREGADO") return "Ese pedido ya se entregó.";
  if (desde === "CANCELADO") return "Ese pedido está anulado.";

  const siguiente = siguienteEstado(desde);
  return siguiente
    ? `Desde "${ETIQUETA_ESTADO[desde]}" el siguiente paso es "${ETIQUETA_ESTADO[siguiente]}".`
    : `No se puede pasar a "${ETIQUETA_ESTADO[hacia]}".`;
}

/**
 * Qué estado le corresponde a un domicilio recién creado.
 *
 * El que entra por el menú QR llega sin que nadie lo haya mirado: dirección,
 * teléfono y costo de envío los escribió el comensal, y hay que confirmarlos
 * antes de ponerse a cocinar. El que carga un cajero o un mesero ya se tomó con
 * la persona al teléfono y la dirección está delante: entra derecho a cocina.
 */
export function estadoInicial(canal: string): EstadoDomicilio {
  return canal === "DOMICILIO_QR" ? "POR_CONFIRMAR" : "EN_PREPARACION";
}

/** Los que todavía no llegaron: lo que anuncia la insignia del menú. */
export const DOMICILIOS_EN_CURSO: readonly EstadoDomicilio[] = [
  "POR_CONFIRMAR",
  "EN_PREPARACION",
  "LISTO",
  "EN_CAMINO",
];

/**
 * Un domicilio entra a la caja recién cuando salió de la cocina.
 *
 * Antes aparecía desde que nacía, así que el cajero veía pedidos que todavía no
 * existían como comida y la insignia de "cuentas por cobrar" contaba de más.
 */
export const DOMICILIOS_COBRABLES: readonly EstadoDomicilio[] = [
  "LISTO",
  "EN_CAMINO",
  "ENTREGADO",
];
