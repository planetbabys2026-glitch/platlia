/**
 * Qué tramo de tiempo se está mirando en Informes.
 *
 * Hasta acá el informe era **de un día y nada más**: para saber cómo viene el mes
 * había que abrir treinta pantallas y sumar a mano. Un día suelto tampoco
 * distingue lo que importa —un martes flojo es un martes, un mes flojo es un
 * problema— y las decisiones que este informe tiene que sostener (contratar,
 * comprar, cambiar la carta) se toman contra un mes o un año, no contra ayer.
 *
 * Todo acá opera sobre **días de negocio**: `Date` puestos en la medianoche UTC
 * del día de calendario, que es como `lib/time.ts` los define y como el driver
 * los escribe en una columna DATE. Por eso la aritmética es UTC pura y no hay una
 * sola zona horaria en este archivo: el `businessDate` ya viene resuelto con la
 * zona y el corte de la empresa, y volver a mezclar zonas acá sería correr el mes
 * cinco horas, que es exactamente el bug que ya pasó con las promociones.
 *
 * Módulo puro y sin `server-only`: lo usan la página, las consultas y los tests.
 */

const DIA_MS = 86_400_000;

export type TipoPeriodo = "dia" | "semana" | "mes" | "anio" | "rango";

export const TIPOS_DE_PERIODO = ["dia", "semana", "mes", "anio", "rango"] as const;

export type Periodo = {
  tipo: TipoPeriodo;
  /** Primer día de negocio incluido. */
  desde: Date;
  /** Último día de negocio incluido. Inclusivo: es un día, no un instante. */
  hasta: Date;
};

export const ETIQUETA_TIPO: Record<TipoPeriodo, string> = {
  dia: "Día",
  semana: "Semana",
  mes: "Mes",
  anio: "Año",
  rango: "Personalizado",
};

function utc(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes, dia));
}

function esTipo(valor: string | undefined): valor is TipoPeriodo {
  return (TIPOS_DE_PERIODO as readonly string[]).includes(valor ?? "");
}

/**
 * La semana arranca el lunes.
 *
 * No es una preferencia estética: la semana comercial de un restaurante va de
 * lunes a domingo, y el fin de semana —que es donde está la mitad de la venta—
 * tiene que quedar **junto** dentro del mismo tramo. Partiéndolo, cada semana
 * mezcla el domingo de una con el sábado de la otra y ninguna comparación
 * significa nada.
 */
function inicioDeSemana(dia: Date): Date {
  const domingoEsCero = dia.getUTCDay();
  const desdeElLunes = (domingoEsCero + 6) % 7;
  return new Date(dia.getTime() - desdeElLunes * DIA_MS);
}

/**
 * El tramo que hay que consultar, a partir de lo que dice la URL.
 *
 * `ancla` es el día que la persona está mirando; el tipo decide cuánto se estira
 * alrededor de él. Así `?jornada=2026-08-27` sigue significando lo mismo que
 * antes cuando no hay `periodo`, y los enlaces viejos no se rompen.
 */
export function resolverPeriodo(args: {
  tipo?: string;
  ancla: Date;
  desde?: Date | null;
  hasta?: Date | null;
}): Periodo {
  const tipo: TipoPeriodo = esTipo(args.tipo) ? args.tipo : "dia";
  const a = args.ancla;

  if (tipo === "rango") {
    // Sin las dos puntas no hay rango que valga: se cae al día, que es el
    // comportamiento de siempre, en vez de inventar un tramo que nadie pidió.
    if (!args.desde || !args.hasta) return { tipo: "dia", desde: a, hasta: a };
    // Escritas al revés se dan vuelta en vez de devolver un tramo vacío: es un
    // error de tipeo evidente y corregirlo no le esconde nada a nadie.
    const [desde, hasta] =
      args.desde.getTime() <= args.hasta.getTime()
        ? [args.desde, args.hasta]
        : [args.hasta, args.desde];
    return { tipo: "rango", desde, hasta };
  }

  if (tipo === "semana") {
    const desde = inicioDeSemana(a);
    return { tipo, desde, hasta: new Date(desde.getTime() + 6 * DIA_MS) };
  }

  if (tipo === "mes") {
    const desde = utc(a.getUTCFullYear(), a.getUTCMonth(), 1);
    return { tipo, desde, hasta: utc(a.getUTCFullYear(), a.getUTCMonth() + 1, 0) };
  }

  if (tipo === "anio") {
    return {
      tipo,
      desde: utc(a.getUTCFullYear(), 0, 1),
      hasta: utc(a.getUTCFullYear(), 11, 31),
    };
  }

  return { tipo: "dia", desde: a, hasta: a };
}

/** Cuántos días de negocio cubre. Inclusivo en las dos puntas. */
export function diasDelPeriodo(p: Periodo): number {
  return Math.round((p.hasta.getTime() - p.desde.getTime()) / DIA_MS) + 1;
}

/**
 * El tramo anterior y el siguiente, del mismo tamaño.
 *
 * Es contra lo que se compara: "vs. período anterior" solo quiere decir algo si el
 * anterior dura lo mismo. Para un rango a medida se corre la ventana entera hacia
 * atrás —no se cae al mes ni a la semana—, así que comparar los últimos 10 días
 * contra los 10 anteriores funciona sin que nadie tenga que calcular las fechas.
 */
export function periodoAnterior(p: Periodo): Periodo {
  if (p.tipo === "mes") {
    const a = p.desde;
    return resolverPeriodo({ tipo: "mes", ancla: utc(a.getUTCFullYear(), a.getUTCMonth() - 1, 1) });
  }
  if (p.tipo === "anio") {
    return resolverPeriodo({ tipo: "anio", ancla: utc(p.desde.getUTCFullYear() - 1, 0, 1) });
  }
  const largo = diasDelPeriodo(p) * DIA_MS;
  return {
    tipo: p.tipo,
    desde: new Date(p.desde.getTime() - largo),
    hasta: new Date(p.hasta.getTime() - largo),
  };
}

export function periodoSiguiente(p: Periodo): Periodo {
  if (p.tipo === "mes") {
    const a = p.desde;
    return resolverPeriodo({ tipo: "mes", ancla: utc(a.getUTCFullYear(), a.getUTCMonth() + 1, 1) });
  }
  if (p.tipo === "anio") {
    return resolverPeriodo({ tipo: "anio", ancla: utc(p.desde.getUTCFullYear() + 1, 0, 1) });
  }
  const largo = diasDelPeriodo(p) * DIA_MS;
  return {
    tipo: p.tipo,
    desde: new Date(p.desde.getTime() + largo),
    hasta: new Date(p.hasta.getTime() + largo),
  };
}

/** El día que hay que poner en la URL para volver a armar este período. */
export function anclaDe(p: Periodo): Date {
  return p.desde;
}

/** Si el día de hoy cae adentro. Es lo que decide si el informe está "en curso". */
export function contiene(p: Periodo, dia: Date): boolean {
  return dia.getTime() >= p.desde.getTime() && dia.getTime() <= p.hasta.getTime();
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * Cómo se lee el período en pantalla.
 *
 * Escrito a mano y no con `Intl`: es la misma razón por la que `lib/time.ts`
 * formatea a mano —la salida de Intl cambia entre versiones de ICU— y además acá
 * hace falta el nombre en minúscula y sin el "de" que mete el locale.
 */
export function etiquetaDePeriodo(p: Periodo): string {
  const d = p.desde;
  const h = p.hasta;

  if (p.tipo === "dia") return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;

  if (p.tipo === "mes") return `${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;

  if (p.tipo === "anio") return `Año ${d.getUTCFullYear()}`;

  // Semana y rango se leen igual: dos puntas. Se omite lo que se repite —el mes,
  // el año— porque "27 de agosto de 2026 a 2 de septiembre de 2026" es una línea
  // que nadie termina de leer.
  const mismoAnio = d.getUTCFullYear() === h.getUTCFullYear();
  const mismoMes = mismoAnio && d.getUTCMonth() === h.getUTCMonth();

  const izq = mismoMes
    ? `${d.getUTCDate()}`
    : `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}${mismoAnio ? "" : ` de ${d.getUTCFullYear()}`}`;
  const der = `${h.getUTCDate()} de ${MESES[h.getUTCMonth()]} de ${h.getUTCFullYear()}`;

  return `${izq} al ${der}`;
}

/** Contra qué se compara, dicho en palabras. */
export function etiquetaComparacion(p: Periodo): string {
  return {
    dia: "vs. día anterior",
    semana: "vs. semana anterior",
    mes: "vs. mes anterior",
    anio: "vs. año anterior",
    rango: "vs. período anterior",
  }[p.tipo];
}
