/**
 * Quién puede mover un renglón por la cocina, y cuánto tardó en cada tramo.
 *
 * Módulo puro y sin `server-only`, por las tres razones de siempre: la Server
 * Action es un POST alcanzable con curl y tiene que validar acá; la pantalla
 * necesita las mismas reglas para no ofrecer un botón que el servidor va a
 * rechazar; y el informe de tiempos —que es un número del que después alguien
 * discute— se prueba sin levantar una base.
 */

/** Los mismos valores del enum `OrderItemStatus` de Prisma. */
export type EstadoRenglon =
  | "PENDIENTE"
  | "EN_PREPARACION"
  | "LISTO"
  | "ENTREGADO"
  | "ANULADO";

/**
 * El camino, en orden y sin atajos.
 *
 * No se salta hacia atrás ni se brinca a entregado desde pendiente: los tiempos
 * que después se miran en los informes solo significan algo si las marcas se
 * pusieron en orden.
 */
export const SIGUIENTE_ESTADO: Partial<Record<EstadoRenglon, EstadoRenglon>> = {
  PENDIENTE: "EN_PREPARACION",
  EN_PREPARACION: "LISTO",
  LISTO: "ENTREGADO",
};

/**
 * Qué marca de tiempo deja cada llegada.
 *
 * `startedAt` es la que faltaba. Sin ella, `sentToKitchenAt → readyAt` era un
 * solo número que mezclaba dos cosas que se arreglan de maneras distintas: lo
 * que el pedido esperó en la fila —que es un problema de dotación— y lo que
 * tardó en cocinarse —que es un problema de la receta o del equipo—.
 */
export const MARCA_AL_LLEGAR: Record<EstadoRenglon, "startedAt" | "readyAt" | "deliveredAt" | null> =
  {
    PENDIENTE: null,
    EN_PREPARACION: "startedAt",
    LISTO: "readyAt",
    ENTREGADO: "deliveredAt",
    ANULADO: null,
  };

/** Quién firma cada llegada. `ENTREGADO` no lleva firma: lo levanta cualquiera. */
export const FIRMA_AL_LLEGAR: Record<EstadoRenglon, "startedById" | "readyById" | null> = {
  PENDIENTE: null,
  EN_PREPARACION: "startedById",
  LISTO: "readyById",
  ENTREGADO: null,
  ANULADO: null,
};

/**
 * Los roles que pueden destrabar un renglón que quedó a nombre de otro.
 *
 * PROPIETARIO no está en la lista porque no hace falta: `tieneRol` ya lo deja
 * pasar por todos lados, y repetirlo acá invitaría a que los dos lugares
 * divergieran.
 */
const RELEVAN = ["ADMINISTRADOR", "PROPIETARIO"] as const;

export type Veredicto =
  | { permitido: true; esRelevo: boolean }
  | { permitido: false; motivo: string };

/**
 * ¿Puede esta persona marcar listo este renglón?
 *
 * **Solo el cocinero que lo tomó.** Es lo que le da sentido a "tomar" un plato:
 * si cualquiera puede cerrarlo, el botón de empezar no compromete a nadie y el
 * tiempo de preparación que sale en el informe no es de quien lo cocinó.
 *
 * Dos excepciones, y las dos son necesarias:
 *
 *  · **Sin dueño se deja pasar.** `startedById` es NULL en todo lo anterior a la
 *    columna, y también en un renglón que entró a `EN_PREPARACION` por un camino
 *    que no es el toque del KDS. Tratar ese NULL como "de nadie, y por lo tanto
 *    de ninguno" dejaría comandas viejas trabadas para siempre.
 *  · **Un administrador releva.** Un cocinero termina el turno, se va, y deja tres
 *    platos a su nombre. Sin válvula, esa comanda no la cierra nadie y la pantalla
 *    de cocina se llena de renglones muertos. El relevo queda firmado en
 *    `readyById`, así que el informe puede excluir ese tiempo en vez de
 *    cargárselo a quien empezó.
 */
export function puedeMarcarListo(args: {
  startedById: string | null;
  actorId: string;
  actorRole: string;
  /** Para el mensaje: a quién hay que ir a buscar. */
  nombreDeQuienLoTomo?: string | null;
}): Veredicto {
  const { startedById, actorId, actorRole } = args;

  if (!startedById) return { permitido: true, esRelevo: false };
  if (startedById === actorId) return { permitido: true, esRelevo: false };
  if ((RELEVAN as readonly string[]).includes(actorRole)) {
    return { permitido: true, esRelevo: true };
  }

  const quien = args.nombreDeQuienLoTomo?.trim();
  return {
    permitido: false,
    motivo: quien
      ? `Ese plato lo tomó ${quien}: solo esa persona puede marcarlo listo.`
      : "Ese plato lo tomó otra persona: solo esa persona puede marcarlo listo.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiempos
// ─────────────────────────────────────────────────────────────────────────────

export type MarcasDeRenglon = {
  sentToKitchenAt: Date | null;
  startedAt: Date | null;
  readyAt: Date | null;
};

export type TiemposDeRenglon = {
  /** De que entró a la plancha a que alguien lo tomó. */
  esperaMs: number | null;
  /** De que alguien lo tomó a que lo dio por terminado. */
  preparacionMs: number | null;
  /** La suma que ve el cliente: de que se envió a que estuvo listo. */
  totalMs: number | null;
};

/**
 * Los dos tramos de un renglón, o `null` donde no se puede saber.
 *
 * `null` no es cero, y la distinción es todo el punto: un negocio que imprime la
 * comanda en papel no tiene ningún toque que registrar, así que todos sus
 * renglones dan `null`. Con cero, el informe anunciaría una cocina que sirve al
 * instante.
 *
 * Un tramo negativo también da `null`: significa que las marcas se escribieron
 * fuera de orden —relojes distintos, una corrección a mano— y un promedio con un
 * número imposible adentro es peor que un promedio con un dato menos.
 */
export function tiemposDeRenglon(marcas: MarcasDeRenglon): TiemposDeRenglon {
  return {
    esperaMs: diferencia(marcas.sentToKitchenAt, marcas.startedAt),
    preparacionMs: diferencia(marcas.startedAt, marcas.readyAt),
    totalMs: diferencia(marcas.sentToKitchenAt, marcas.readyAt),
  };
}

function diferencia(desde: Date | null, hasta: Date | null): number | null {
  if (!desde || !hasta) return null;
  const ms = hasta.getTime() - desde.getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/**
 * El promedio de los que se pueden medir, y cuántos eran.
 *
 * Devuelve la cuenta además del promedio porque un promedio sobre dos renglones
 * y uno sobre doscientos se leen igual en pantalla y no valen lo mismo.
 */
export function promedioMs(valores: readonly (number | null)[]): {
  promedioMs: number | null;
  medidos: number;
} {
  const medibles = valores.filter((v): v is number => v !== null);
  if (medibles.length === 0) return { promedioMs: null, medidos: 0 };
  const suma = medibles.reduce((a, b) => a + b, 0);
  return { promedioMs: Math.round(suma / medibles.length), medidos: medibles.length };
}

/**
 * "4 min", "1 h 20 min", "45 s".
 *
 * Se corta en minutos porque es la unidad en la que se habla de una cocina;
 * los segundos solo aparecen abajo del minuto, donde decir "0 min" sería decir
 * que no tardó nada.
 */
export function formatDuracion(ms: number | null): string {
  if (ms === null) return "—";
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return `${Math.max(0, Math.round(ms / 1000))} s`;
  if (totalMin < 60) return `${totalMin} min`;
  const horas = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min === 0 ? `${horas} h` : `${horas} h ${min} min`;
}
