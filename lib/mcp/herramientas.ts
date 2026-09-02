import "server-only";
import {
  getAlertasInventario,
  getCostoYMargen,
  getGastosDeCaja,
  getHorasPico,
  getPorMetodoDePago,
  getProductosMasVendidos,
  getResumenDeJornada,
  getTiemposDeCocina,
} from "@/features/informes/queries";
import { resolverPeriodo, etiquetaDePeriodo, type TipoPeriodo } from "@/features/informes/periodo";
import { getSettings } from "@/features/negocio/queries";
import { currentBusinessDate, formatBusinessDate, parseBusinessDate } from "@/lib/time";
import { formatCop } from "@/lib/money";
import { formatDuracion } from "@/features/cocina/reglas";

/**
 * Lo que la IA de un negocio puede preguntar sobre SU información.
 *
 * Tres reglas que gobiernan este archivo, y las tres son de seguridad antes que
 * de producto:
 *
 * 1. **Solo lectura.** No hay una sola herramienta que cobre, anule, cambie un
 *    precio ni toque el stock. El radio de daño de un asistente confundido —o de
 *    un token filtrado— tiene que ser "alguien vio mis números", nunca "alguien
 *    me anuló la noche". Un agente que se equivoca al leer da una respuesta mala;
 *    uno que se equivoca al escribir arruina una caja.
 *
 * 2. **Nada de datos de comensales.** Ni nombres, ni teléfonos, ni direcciones de
 *    entrega. Esa información es de terceros que se la dieron al restaurante, no
 *    a un asistente de un proveedor de IA: mandarla afuera sin su consentimiento
 *    es exactamente lo que la ley de habeas data no permite. Todo lo que sale de
 *    acá es agregado.
 *
 * 3. **Se apoya en las consultas que ya existen.** No hay SQL nuevo: son las
 *    mismas funciones que pintan la pantalla de Informes. Si "ventas" se
 *    calculara distinto acá, el dueño tendría dos cifras y ninguna confiable, que
 *    es peor que no tener el módulo.
 *
 * El resultado se devuelve en TEXTO ya formateado y no en JSON crudo: quien lee
 * esto es un modelo que va a repetirlo casi tal cual, y "$1.250.000" se lee mejor
 * que `1250000`. Los números ya vienen con su moneda y sus unidades para que no
 * los reinterprete.
 */

export type Herramienta = {
  nombre: string;
  descripcion: string;
  esquema: Record<string, unknown>;
  ejecutar: (businessId: string, args: Record<string, unknown>) => Promise<string>;
};

/** El período que pide el asistente, con los mismos nombres que la pantalla. */
const ESQUEMA_PERIODO = {
  type: "object",
  properties: {
    periodo: {
      type: "string",
      enum: ["dia", "semana", "mes", "anio"],
      description:
        "Qué tramo mirar. 'dia' es la jornada de negocio en curso, que no termina a medianoche sino en el corte configurado por la empresa.",
    },
    fecha: {
      type: "string",
      description:
        "Día de referencia en formato AAAA-MM-DD. Si no se envía, se usa la jornada en curso.",
    },
  },
} as const;

async function periodoDe(businessId: string, args: Record<string, unknown>) {
  const settings = await getSettings(businessId);
  const hoy = currentBusinessDate(settings);

  let ancla = hoy;
  if (typeof args.fecha === "string") {
    try {
      ancla = parseBusinessDate(args.fecha);
    } catch {
      // Una fecha ilegible no rompe la respuesta: se usa hoy y el texto lo dice.
    }
  }

  const periodo = resolverPeriodo({ tipo: args.periodo as TipoPeriodo | undefined, ancla });
  return { periodo, settings, etiqueta: etiquetaDePeriodo(periodo) };
}

export const HERRAMIENTAS: Herramienta[] = [
  {
    nombre: "ventas",
    descripcion:
      "Cuánto vendió el negocio en un período: total, impuesto, propinas, cantidad de pedidos y ticket promedio. Solo cuenta pedidos ya cobrados.",
    esquema: ESQUEMA_PERIODO,
    async ejecutar(businessId, args) {
      const { periodo, etiqueta } = await periodoDe(businessId, args);
      const r = await getResumenDeJornada(businessId, periodo);
      const metodos = await getPorMetodoDePago(businessId, periodo);

      if (r.pedidos === 0) return `No hay ventas cobradas en ${etiqueta}.`;

      const ticket = Math.round(r.ventasCop / r.pedidos);
      return [
        `Ventas de ${etiqueta}:`,
        `- Total vendido: ${formatCop(r.ventasCop)}`,
        `- Pedidos cobrados: ${r.pedidos}`,
        `- Ticket promedio: ${formatCop(ticket)}`,
        `- Base gravable: ${formatCop(r.baseGravableCop)}`,
        `- Impuesto: ${formatCop(r.impuestoCop)}`,
        `- Propinas: ${formatCop(r.propinasCop)}`,
        `- Descuentos: ${formatCop(r.descuentosCop)}`,
        "",
        "Cómo pagaron:",
        ...metodos.map((m) => `- ${m.method}: ${formatCop(m.totalCop)} en ${m.cantidad} cobros`),
      ].join("\n");
    },
  },
  {
    nombre: "productos_mas_vendidos",
    descripcion:
      "Los productos que más facturaron en un período, con unidades vendidas y total.",
    esquema: ESQUEMA_PERIODO,
    async ejecutar(businessId, args) {
      const { periodo, etiqueta } = await periodoDe(businessId, args);
      const top = await getProductosMasVendidos(businessId, periodo, 15);
      if (top.length === 0) return `No se vendió nada en ${etiqueta}.`;
      return [
        `Lo más vendido en ${etiqueta}:`,
        ...top.map(
          (p, i) => `${i + 1}. ${p.nombre} — ${p.unidades} unidades, ${formatCop(p.totalCop)}`,
        ),
      ].join("\n");
    },
  },
  {
    nombre: "horas_pico",
    descripcion:
      "A qué horas entran los pedidos, para saber cuándo hace falta más personal. Cuenta la hora en que el pedido se abrió, no la del pago.",
    esquema: ESQUEMA_PERIODO,
    async ejecutar(businessId, args) {
      const { periodo, settings, etiqueta } = await periodoDe(businessId, args);
      const r = await getHorasPico(businessId, periodo, settings.timeZone);
      if (r.pedidos === 0) return `No hay pedidos en ${etiqueta}.`;
      const conMovimiento = r.franjas.filter((f) => f.pedidos > 0);
      return [
        `Horas de más movimiento en ${etiqueta} (${r.dias} ${r.dias === 1 ? "jornada" : "jornadas"}):`,
        r.pico ? `- Hora pico: ${String(r.pico.hora).padStart(2, "0")}:00 con ${r.pico.pedidos} pedidos` : "",
        "",
        ...conMovimiento.map(
          (f) => `- ${String(f.hora).padStart(2, "0")}:00 — ${f.pedidos} pedidos, ${formatCop(f.ventasCop)}`,
        ),
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
  {
    nombre: "inventario_bajo",
    descripcion:
      "Qué insumos y productos están agotados o por debajo del mínimo. Sirve para armar la lista de compras.",
    esquema: { type: "object", properties: {} },
    async ejecutar(businessId) {
      const alertas = await getAlertasInventario(businessId);
      if (alertas.length === 0) return "No hay alertas de inventario: todo está por encima del mínimo.";
      const criticas = alertas.filter((a) => a.nivel === "CRITICO");
      const bajas = alertas.filter((a) => a.nivel !== "CRITICO");
      return [
        `${alertas.length} alertas de inventario.`,
        ...(criticas.length ? ["", "Agotado:", ...criticas.map((a) => `- ${a.nombre}: ${a.mensaje}`)] : []),
        ...(bajas.length ? ["", "Por debajo del mínimo:", ...bajas.map((a) => `- ${a.nombre}: ${a.mensaje}`)] : []),
      ].join("\n");
    },
  },
  {
    nombre: "margen_por_producto",
    descripcion:
      "Cuánto deja cada producto: venta neta, costo y margen. Requiere el módulo de inventario activo y costos cargados.",
    esquema: ESQUEMA_PERIODO,
    async ejecutar(businessId, args) {
      const { periodo, etiqueta } = await periodoDe(businessId, args);
      const m = await getCostoYMargen(businessId, periodo);
      if (!m.inventarioActivo)
        return "El módulo de inventario está apagado, así que no hay costos cargados y no se puede calcular el margen.";
      if (m.productos.length === 0) return `No se vendió nada en ${etiqueta}.`;

      return [
        `Margen de ${etiqueta}:`,
        `- Venta neta: ${formatCop(m.ventaNetaCop)} (base gravable, sin el impuesto)`,
        `- Costo: ${formatCop(m.costoCop)}`,
        `- Utilidad: ${formatCop(m.utilidadCop)}`,
        `- Margen: ${m.margenPct === null ? "sin datos" : `${m.margenPct}%`}`,
        ...(m.renglonesSinCosto > 0
          ? [
              `- Atención: ${m.renglonesSinCosto} de ${m.renglonesTotales} renglones se vendieron sin costo conocido, así que la utilidad está por encima de la real.`,
            ]
          : []),
        "",
        "Por producto:",
        ...m.productos
          .slice(0, 20)
          .map(
            (p) =>
              `- ${p.nombre}: ${p.unidades} und · venta ${formatCop(p.ventaNetaCop)} · costo ${formatCop(p.costoCop)} · margen ${p.margenPct === null ? "—" : `${p.margenPct}%`}`,
          ),
      ].join("\n");
    },
  },
  {
    nombre: "tiempos_de_cocina",
    descripcion:
      "Cuánto tarda la cocina: lo que el plato espera antes de que alguien lo tome y lo que tarda en prepararse, por cocinero. Solo hay datos si el negocio usa la pantalla de cocina.",
    esquema: ESQUEMA_PERIODO,
    async ejecutar(businessId, args) {
      const { periodo, etiqueta } = await periodoDe(businessId, args);
      const c = await getTiemposDeCocina(businessId, periodo);
      if (!c.kdsActivo)
        return "Este negocio tiene la comanda configurada solo para imprimirse, así que no hay toques en la pantalla de cocina y no se pueden medir los tiempos.";
      if (c.renglones === 0) return `Nadie tomó platos en la pantalla de cocina durante ${etiqueta}.`;

      return [
        `Tiempos de cocina en ${etiqueta}:`,
        `- Espera antes de empezar: ${formatDuracion(c.esperaPromedioMs)} (${c.medidosEspera} platos)`,
        `- Preparación: ${formatDuracion(c.preparacionPromedioMs)} (${c.medidosPreparacion} platos)`,
        "",
        "Por cocinero:",
        ...c.cocineros.map(
          (k) =>
            `- ${k.cocinero}: ${k.renglones} platos · espera ${formatDuracion(k.esperaPromedioMs)} · preparación ${formatDuracion(k.preparacionPromedioMs)}${k.relevados > 0 ? ` · ${k.relevados} los terminó otra persona` : ""}`,
        ),
      ].join("\n");
    },
  },
  {
    nombre: "gastos_y_ganancia",
    descripcion:
      "Qué se gastó por la caja en un período y qué ganancia estimada queda: ventas menos impuesto y propinas, menos los gastos. Sirve sobre todo en negocios que no llevan inventario, donde no hay costo por receta. Los retiros no se descuentan.",
    esquema: ESQUEMA_PERIODO,
    async ejecutar(businessId, args) {
      const { periodo, etiqueta } = await periodoDe(businessId, args);
      const [r, g] = await Promise.all([
        getResumenDeJornada(businessId, periodo),
        getGastosDeCaja(businessId, periodo),
      ]);

      if (r.pedidos === 0 && g.movimientos === 0) {
        return `No hay ventas ni gastos registrados en ${etiqueta}.`;
      }

      // La misma aritmética que la pantalla, y a propósito: si acá se calculara
      // distinto, el dueño tendría dos ganancias y ninguna confiable.
      const ingresoCop = r.ventasCop - r.impuestoCop - r.propinasCop;
      const gananciaCop = ingresoCop - g.gastosCop;

      const lineas = [
        `Ganancia estimada de ${etiqueta}:`,
        `- Ventas facturadas: ${formatCop(r.ventasCop)}`,
        `- Menos impuesto (se entrega): ${formatCop(r.impuestoCop)}`,
        `- Menos propinas (son del equipo): ${formatCop(r.propinasCop)}`,
        `- Ingreso del negocio: ${formatCop(ingresoCop)}`,
        `- Menos gastos pagados por caja: ${formatCop(g.gastosCop)} en ${g.movimientos} ${g.movimientos === 1 ? "movimiento" : "movimientos"}`,
        `- GANANCIA ESTIMADA: ${formatCop(gananciaCop)}`,
        `  (${formatCop(g.efectivoCop)} de esos gastos salieron en efectivo y ${formatCop(g.bancoCop)} por bancos)`,
      ];

      if (g.retirosCop > 0) {
        lineas.push(
          `- Retiros del período: ${formatCop(g.retirosCop)}. NO se descuentan de la ganancia: sacar la plata del cajón la mueve de lugar, no la gasta.`,
        );
      }

      if (g.conceptos.length > 0) {
        lineas.push("", "En qué se fue:");
        for (const c of g.conceptos) {
          lineas.push(
            `- ${c.concepto}: ${formatCop(c.totalCop)}${c.cantidad > 1 ? ` en ${c.cantidad} veces` : ""}`,
          );
        }
      }

      // Que el modelo sepa qué NO es esta cifra, o va a llamarla "utilidad" y
      // alguien va a tomar una decisión de plata con eso.
      lineas.push(
        "",
        "Es una estimación de caja, no una utilidad contable: descuenta lo que se pagó POR LA CAJA, no el costo de la mercancía vendida ni los gastos pagados por fuera del sistema.",
      );

      return lineas.join("\n");
    },
  },
  {
    nombre: "jornada_actual",
    descripcion:
      "Qué día de negocio está en curso y con qué corte, para interpretar el resto de las respuestas.",
    esquema: { type: "object", properties: {} },
    async ejecutar(businessId) {
      const settings = await getSettings(businessId);
      const hoy = currentBusinessDate(settings);
      const corte = `${String(Math.floor(settings.businessDayStartMinutes / 60)).padStart(2, "0")}:${String(settings.businessDayStartMinutes % 60).padStart(2, "0")}`;
      return [
        `Jornada en curso: ${formatBusinessDate(hoy)}.`,
        `Zona horaria: ${settings.timeZone}.`,
        `El día de negocio arranca a las ${corte}: lo vendido antes de esa hora cuenta para la jornada anterior.`,
      ].join("\n");
    },
  },
];

export const HERRAMIENTA_POR_NOMBRE = new Map(HERRAMIENTAS.map((h) => [h.nombre, h]));
