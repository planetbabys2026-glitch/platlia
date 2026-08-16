import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  olvidarPedido,
  pedidoRecordado,
  recordarPedido,
  VIGENCIA_MS,
} from "@/app/m/[slug]/pedido-recordado";

/**
 * Que al recargar el menú QR no se pierda el pedido, y que ese recuerdo no le
 * muestre a nadie el pedido de otro.
 */

// `localStorage` de mentira: los tests corren en Node.
function montarAlmacenamiento() {
  const datos = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  });
  return datos;
}

describe("pedidoRecordado", () => {
  let datos: Map<string, string>;
  beforeEach(() => {
    datos = montarAlmacenamiento();
  });

  it("devuelve el pedido que se acaba de guardar", () => {
    recordarPedido("bar-demo", "ord_123");
    expect(pedidoRecordado("bar-demo")).toBe("ord_123");
  });

  it("sin nada guardado no inventa un pedido", () => {
    expect(pedidoRecordado("bar-demo")).toBeNull();
  });

  it("cada negocio tiene su propio recuerdo", () => {
    // El mismo teléfono puede escanear el QR de dos locales distintos.
    recordarPedido("bar-demo", "ord_a");
    recordarPedido("otro-bar", "ord_b");
    expect(pedidoRecordado("bar-demo")).toBe("ord_a");
    expect(pedidoRecordado("otro-bar")).toBe("ord_b");
  });

  it("dentro de la ventana sigue valiendo", () => {
    const t0 = 1_000_000;
    vi.spyOn(Date, "now").mockReturnValue(t0);
    recordarPedido("bar-demo", "ord_123");
    expect(pedidoRecordado("bar-demo", t0 + VIGENCIA_MS - 1)).toBe("ord_123");
  });

  it("pasada la ventana se olvida solo", () => {
    // Es lo que evita que una tablet prestada le muestre al comensal siguiente
    // el pedido del anterior.
    const t0 = 1_000_000;
    vi.spyOn(Date, "now").mockReturnValue(t0);
    recordarPedido("bar-demo", "ord_123");
    expect(pedidoRecordado("bar-demo", t0 + VIGENCIA_MS + 1)).toBeNull();
  });

  it("al vencer también borra la marca, no la deja acumulada", () => {
    const t0 = 1_000_000;
    vi.spyOn(Date, "now").mockReturnValue(t0);
    recordarPedido("bar-demo", "ord_123");
    pedidoRecordado("bar-demo", t0 + VIGENCIA_MS + 1);
    expect(datos.size).toBe(0);
  });

  it("olvidar borra de verdad", () => {
    recordarPedido("bar-demo", "ord_123");
    olvidarPedido("bar-demo");
    expect(pedidoRecordado("bar-demo")).toBeNull();
  });

  it("un dato corrupto no rompe la pantalla", () => {
    datos.set("platlia_qr_pedido_bar-demo", "{no es json");
    expect(pedidoRecordado("bar-demo")).toBeNull();
  });

  it("un dato con la forma equivocada se descarta y se limpia", () => {
    datos.set("platlia_qr_pedido_bar-demo", JSON.stringify({ orderId: 42 }));
    expect(pedidoRecordado("bar-demo")).toBeNull();
    expect(datos.size).toBe(0);
  });

  it("no guarda ningún dato personal", () => {
    // Si alguien mira este teléfono después, no encuentra el teléfono ni la
    // dirección de quien pidió: solo un id que sin el negocio no dice nada.
    recordarPedido("bar-demo", "ord_123");
    const guardado = datos.get("platlia_qr_pedido_bar-demo")!;
    expect(guardado).toContain("ord_123");
    expect(Object.keys(JSON.parse(guardado)).sort()).toEqual(["guardadoEn", "orderId"]);
  });
});
