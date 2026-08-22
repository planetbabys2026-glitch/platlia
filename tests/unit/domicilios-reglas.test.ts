import { describe, expect, it } from "vitest";
import {
  DOMICILIOS_COBRABLES,
  DOMICILIOS_EN_CURSO,
  esFinal,
  estadoInicial,
  FLUJO_DOMICILIO,
  motivoDelRechazo,
  puedeAvanzar,
  siguienteEstado,
  type EstadoDomicilio,
} from "@/features/domicilios/reglas";

/**
 * El recorrido de un domicilio.
 *
 * Un error acá no rompe ninguna pantalla: manda a la cocina un pedido que nadie
 * confirmó, o le dice al cliente que su comida salió cuando sigue en el mostrador.
 */

describe("el camino feliz", () => {
  it("avanza de a un paso, en orden", () => {
    expect(siguienteEstado("POR_CONFIRMAR")).toBe("EN_PREPARACION");
    expect(siguienteEstado("EN_PREPARACION")).toBe("LISTO");
    expect(siguienteEstado("LISTO")).toBe("EN_CAMINO");
    expect(siguienteEstado("EN_CAMINO")).toBe("ENTREGADO");
  });

  it("cada paso del flujo es alcanzable desde el anterior", () => {
    for (let i = 0; i < FLUJO_DOMICILIO.length - 1; i++) {
      expect(puedeAvanzar(FLUJO_DOMICILIO[i], FLUJO_DOMICILIO[i + 1])).toBe(true);
    }
  });

  it("de entregado no se sale", () => {
    expect(siguienteEstado("ENTREGADO")).toBeNull();
    expect(esFinal("ENTREGADO")).toBe(true);
    expect(esFinal("CANCELADO")).toBe(true);
  });
});

describe("lo que la máquina de estados impide", () => {
  it("no se saltea la cocina", () => {
    // El caso que motivó las reglas: un POST directo pasando de recién llegado
    // a entregado, sin que nadie confirme la dirección ni prepare la comida.
    expect(puedeAvanzar("POR_CONFIRMAR", "ENTREGADO")).toBe(false);
    expect(puedeAvanzar("POR_CONFIRMAR", "EN_CAMINO")).toBe(false);
    expect(puedeAvanzar("EN_PREPARACION", "ENTREGADO")).toBe(false);
  });

  it("no se vuelve atrás", () => {
    expect(puedeAvanzar("EN_CAMINO", "EN_PREPARACION")).toBe(false);
    expect(puedeAvanzar("ENTREGADO", "EN_CAMINO")).toBe(false);
    expect(puedeAvanzar("LISTO", "POR_CONFIRMAR")).toBe(false);
  });

  it("no se repite el estado en el que ya está", () => {
    for (const estado of FLUJO_DOMICILIO) {
      expect(puedeAvanzar(estado, estado)).toBe(false);
    }
  });

  it("de un pedido anulado no se sale", () => {
    expect(puedeAvanzar("CANCELADO", "EN_PREPARACION")).toBe(false);
    expect(puedeAvanzar("CANCELADO", "ENTREGADO")).toBe(false);
  });
});

describe("anular", () => {
  it("se puede desde cualquier punto del camino", () => {
    for (const estado of ["POR_CONFIRMAR", "EN_PREPARACION", "LISTO", "EN_CAMINO"] as const) {
      expect(puedeAvanzar(estado, "CANCELADO")).toBe(true);
    }
  });

  it("lo entregado no se anula desde acá", () => {
    // Ya está en manos del cliente: eso se corrige anulando la venta, que emite
    // su nota crédito, no moviendo un estado de reparto.
    expect(puedeAvanzar("ENTREGADO", "CANCELADO")).toBe(false);
  });
});

describe("motivoDelRechazo", () => {
  it("no dice nada cuando sí se puede", () => {
    expect(motivoDelRechazo("POR_CONFIRMAR", "EN_PREPARACION")).toBeNull();
  });

  it("dice cuál era el paso que seguía", () => {
    expect(motivoDelRechazo("POR_CONFIRMAR", "ENTREGADO")).toContain("En cocina");
  });

  it("distingue entregado de anulado", () => {
    expect(motivoDelRechazo("ENTREGADO", "CANCELADO")).toContain("ya se entregó");
    expect(motivoDelRechazo("CANCELADO", "EN_PREPARACION")).toContain("anulado");
  });
});

describe("estadoInicial", () => {
  it("lo del QR entra sin confirmar", () => {
    // Dirección, teléfono y costo los escribió el comensal: alguien los mira
    // antes de que la cocina se ponga a trabajar.
    expect(estadoInicial("DOMICILIO_QR")).toBe("POR_CONFIRMAR");
  });

  it("lo que carga el negocio entra derecho a cocina", () => {
    // Se tomó con la persona al teléfono y la dirección está delante.
    expect(estadoInicial("POS")).toBe("EN_PREPARACION");
    expect(estadoInicial("MESERO")).toBe("EN_PREPARACION");
  });
});

describe("los conjuntos que filtran las pantallas", () => {
  it("en curso es todo lo que todavía no terminó", () => {
    const enCurso = new Set<EstadoDomicilio>(DOMICILIOS_EN_CURSO);
    expect(enCurso.has("ENTREGADO")).toBe(false);
    expect(enCurso.has("CANCELADO")).toBe(false);
    expect(enCurso.size).toBe(4);
  });

  it("a la caja no llega nada que siga en la cocina", () => {
    const cobrables = new Set<EstadoDomicilio>(DOMICILIOS_COBRABLES);
    expect(cobrables.has("POR_CONFIRMAR")).toBe(false);
    expect(cobrables.has("EN_PREPARACION")).toBe(false);
    expect(cobrables.has("LISTO")).toBe(true);
  });
});
