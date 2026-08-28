import { describe, expect, it } from "vitest";
import {
  anclaDe,
  contiene,
  diasDelPeriodo,
  etiquetaComparacion,
  etiquetaDePeriodo,
  periodoAnterior,
  periodoSiguiente,
  resolverPeriodo,
  type Periodo,
} from "@/features/informes/periodo";
import { formatBusinessDate, parseBusinessDate } from "@/lib/time";

const d = parseBusinessDate;
const par = (p: Periodo) => [formatBusinessDate(p.desde), formatBusinessDate(p.hasta)];

describe("resolverPeriodo", () => {
  it("sin tipo es un día suelto: los enlaces viejos siguen significando lo mismo", () => {
    const p = resolverPeriodo({ ancla: d("2026-08-27") });
    expect(p.tipo).toBe("dia");
    expect(par(p)).toEqual(["2026-08-27", "2026-08-27"]);
  });

  it("un tipo que no existe se cae al día en vez de reventar", () => {
    expect(resolverPeriodo({ tipo: "trimestre", ancla: d("2026-08-27") }).tipo).toBe("dia");
  });

  it("la semana arranca el lunes, para no partir el fin de semana", () => {
    // 2026-08-27 es jueves.
    expect(par(resolverPeriodo({ tipo: "semana", ancla: d("2026-08-27") }))).toEqual([
      "2026-08-24",
      "2026-08-30",
    ]);
  });

  it("un lunes y un domingo caen en la misma semana", () => {
    const lunes = par(resolverPeriodo({ tipo: "semana", ancla: d("2026-08-24") }));
    const domingo = par(resolverPeriodo({ tipo: "semana", ancla: d("2026-08-30") }));
    expect(lunes).toEqual(domingo);
  });

  it("el mes llega hasta su último día, sea 28, 30 o 31", () => {
    expect(par(resolverPeriodo({ tipo: "mes", ancla: d("2026-08-27") }))).toEqual([
      "2026-08-01",
      "2026-08-31",
    ]);
    expect(par(resolverPeriodo({ tipo: "mes", ancla: d("2026-02-10") }))).toEqual([
      "2026-02-01",
      "2026-02-28",
    ]);
    // 2028 es bisiesto.
    expect(par(resolverPeriodo({ tipo: "mes", ancla: d("2028-02-10") }))).toEqual([
      "2028-02-01",
      "2028-02-29",
    ]);
  });

  it("el año va del 1 de enero al 31 de diciembre", () => {
    expect(par(resolverPeriodo({ tipo: "anio", ancla: d("2026-08-27") }))).toEqual([
      "2026-01-01",
      "2026-12-31",
    ]);
  });

  it("un rango escrito al revés se da vuelta", () => {
    expect(
      par(resolverPeriodo({ tipo: "rango", ancla: d("2026-08-27"), desde: d("2026-08-30"), hasta: d("2026-08-01") })),
    ).toEqual(["2026-08-01", "2026-08-30"]);
  });

  it("un rango sin las dos puntas se cae al día", () => {
    expect(resolverPeriodo({ tipo: "rango", ancla: d("2026-08-27"), desde: d("2026-08-01") }).tipo).toBe("dia");
  });
});

describe("diasDelPeriodo", () => {
  it("un día es un día, no cero", () => {
    expect(diasDelPeriodo(resolverPeriodo({ ancla: d("2026-08-27") }))).toBe(1);
  });
  it("cuenta las dos puntas", () => {
    expect(diasDelPeriodo(resolverPeriodo({ tipo: "semana", ancla: d("2026-08-27") }))).toBe(7);
    expect(diasDelPeriodo(resolverPeriodo({ tipo: "mes", ancla: d("2026-08-27") }))).toBe(31);
    expect(diasDelPeriodo(resolverPeriodo({ tipo: "anio", ancla: d("2026-08-27") }))).toBe(365);
    expect(diasDelPeriodo(resolverPeriodo({ tipo: "anio", ancla: d("2028-05-01") }))).toBe(366);
  });
});

describe("el período anterior dura lo mismo", () => {
  it("un día atrás es el día anterior", () => {
    expect(par(periodoAnterior(resolverPeriodo({ ancla: d("2026-08-01") })))).toEqual([
      "2026-07-31",
      "2026-07-31",
    ]);
  });

  it("una semana atrás es la semana anterior completa", () => {
    expect(par(periodoAnterior(resolverPeriodo({ tipo: "semana", ancla: d("2026-08-27") })))).toEqual([
      "2026-08-17",
      "2026-08-23",
    ]);
  });

  it("el mes anterior es el mes calendario, no 31 días atrás", () => {
    // Restar días daría 2026-07-01..2026-07-31 por casualidad en agosto, pero
    // rompería en marzo: marzo tiene 31 y febrero 28.
    expect(par(periodoAnterior(resolverPeriodo({ tipo: "mes", ancla: d("2026-03-15") })))).toEqual([
      "2026-02-01",
      "2026-02-28",
    ]);
  });

  it("enero retrocede a diciembre del año pasado", () => {
    expect(par(periodoAnterior(resolverPeriodo({ tipo: "mes", ancla: d("2026-01-10") })))).toEqual([
      "2025-12-01",
      "2025-12-31",
    ]);
  });

  it("el año anterior es el año calendario", () => {
    expect(par(periodoAnterior(resolverPeriodo({ tipo: "anio", ancla: d("2026-08-27") })))).toEqual([
      "2025-01-01",
      "2025-12-31",
    ]);
  });

  it("un rango a medida corre la ventana entera, así que 10 días se comparan con 10", () => {
    const p = resolverPeriodo({
      tipo: "rango",
      ancla: d("2026-08-27"),
      desde: d("2026-08-11"),
      hasta: d("2026-08-20"),
    });
    expect(diasDelPeriodo(p)).toBe(10);
    const previo = periodoAnterior(p);
    expect(par(previo)).toEqual(["2026-08-01", "2026-08-10"]);
    expect(diasDelPeriodo(previo)).toBe(10);
  });

  it("ir y volver deja el mismo período", () => {
    for (const tipo of ["dia", "semana", "mes", "anio"] as const) {
      const p = resolverPeriodo({ tipo, ancla: d("2026-08-27") });
      expect(par(periodoSiguiente(periodoAnterior(p)))).toEqual(par(p));
    }
  });
});

describe("cómo se lee", () => {
  it("cada tipo se dice como se habla", () => {
    expect(etiquetaDePeriodo(resolverPeriodo({ ancla: d("2026-08-27") }))).toBe("27 de agosto de 2026");
    expect(etiquetaDePeriodo(resolverPeriodo({ tipo: "mes", ancla: d("2026-08-27") }))).toBe("agosto de 2026");
    expect(etiquetaDePeriodo(resolverPeriodo({ tipo: "anio", ancla: d("2026-08-27") }))).toBe("Año 2026");
  });

  it("un tramo dentro del mismo mes no repite el mes", () => {
    expect(etiquetaDePeriodo(resolverPeriodo({ tipo: "semana", ancla: d("2026-08-27") }))).toBe(
      "24 al 30 de agosto de 2026",
    );
  });

  it("un tramo a caballo de dos meses los nombra a los dos", () => {
    expect(etiquetaDePeriodo(resolverPeriodo({ tipo: "semana", ancla: d("2026-08-31") }))).toBe(
      "31 de agosto al 6 de septiembre de 2026",
    );
  });

  it("a caballo de dos años se nombran los dos años", () => {
    expect(etiquetaDePeriodo(resolverPeriodo({ tipo: "semana", ancla: d("2026-12-31") }))).toBe(
      "28 de diciembre de 2026 al 3 de enero de 2027",
    );
  });

  it("la comparación dice contra qué, y nunca 'vs. día anterior' en un mes", () => {
    expect(etiquetaComparacion(resolverPeriodo({ tipo: "mes", ancla: d("2026-08-27") }))).toBe("vs. mes anterior");
    expect(etiquetaComparacion(resolverPeriodo({ tipo: "rango", ancla: d("2026-08-27"), desde: d("2026-08-01"), hasta: d("2026-08-05") }))).toBe(
      "vs. período anterior",
    );
  });
});

describe("contiene y ancla", () => {
  it("el mes en curso contiene a hoy", () => {
    const p = resolverPeriodo({ tipo: "mes", ancla: d("2026-08-01") });
    expect(contiene(p, d("2026-08-27"))).toBe(true);
    expect(contiene(p, d("2026-09-01"))).toBe(false);
    expect(contiene(p, d("2026-07-31"))).toBe(false);
  });

  it("el ancla reconstruye el mismo período", () => {
    const p = resolverPeriodo({ tipo: "semana", ancla: d("2026-08-27") });
    expect(par(resolverPeriodo({ tipo: "semana", ancla: anclaDe(p) }))).toEqual(par(p));
  });
});
