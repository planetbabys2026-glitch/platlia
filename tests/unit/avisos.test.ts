import { describe, expect, it } from "vitest";
import { describirAviso } from "@/lib/avisos";

/**
 * El título de un aviso es lo único que alguien lee de verdad: aparece dos
 * segundos sobre la pantalla que está usando, en una cocina, con las manos
 * ocupadas. Por eso se prueba acá y no a través de una pantalla.
 */

const TS = 1_700_000_000_000;

describe("describirAviso · comanda a cocina", () => {
  it("nombra la mesa y la cuenta cuando el grupo pidió por separado", () => {
    const aviso = describirAviso({
      tipo: "COCINA_NUEVA_COMANDA",
      orderId: "ord1",
      code: 412,
      mesa: "5",
      cuenta: "Andrés",
      turno: 7,
      productos: 3,
      ts: TS,
    });

    expect(aviso.titulo).toBe("Mesa 5 · Andrés");
    expect(aviso.detalle).toBe("3 productos");
    expect(aviso.href).toBe("/cocina");
    expect(aviso.id).toBe(`ord1:COCINA_NUEVA_COMANDA:${TS}`);
  });

  it("con la mesa sola alcanza cuando la cuenta no tiene nombre", () => {
    const aviso = describirAviso({
      tipo: "COCINA_NUEVA_COMANDA",
      orderId: "ord2",
      code: 413,
      mesa: "12",
      cuenta: null,
      turno: 8,
      productos: 1,
      ts: TS,
    });

    expect(aviso.titulo).toBe("Mesa 12");
    // Un producto no son "1 productos".
    expect(aviso.detalle).toBe("1 producto");
  });

  it("un nombre en blanco cuenta como no escrito", () => {
    const aviso = describirAviso({
      tipo: "COCINA_NUEVA_COMANDA",
      orderId: "ord3",
      code: 414,
      mesa: "3",
      cuenta: "   ",
      turno: null,
      productos: 2,
      ts: TS,
    });

    expect(aviso.titulo).toBe("Mesa 3");
  });

  it("sin mesa manda el turno, que es lo que se grita, y el nombre atrás", () => {
    const aviso = describirAviso({
      tipo: "COCINA_NUEVA_COMANDA",
      orderId: "ord4",
      code: 415,
      mesa: null,
      cuenta: "Camila",
      turno: 7,
      productos: 4,
      ts: TS,
    });

    // Con cero a la izquierda, igual que en el televisor del salón.
    expect(aviso.titulo).toBe("Turno 07 · Camila");
  });

  it("sin mesa y sin turno queda el consecutivo, que siempre existe", () => {
    const aviso = describirAviso({
      tipo: "COCINA_NUEVA_COMANDA",
      orderId: "ord5",
      code: 416,
      mesa: null,
      cuenta: null,
      turno: null,
      productos: 2,
      ts: TS,
    });

    expect(aviso.titulo).toBe("Pedido #416");
  });
});

describe("describirAviso · domicilio nuevo", () => {
  it("nombra al cliente y manda la dirección como detalle", () => {
    const aviso = describirAviso({
      tipo: "DOMICILIO_NUEVO",
      orderId: "ord6",
      code: 417,
      cliente: "Camila",
      direccion: "Cra 45 #12-30",
      productos: 3,
      ts: TS,
    });

    expect(aviso.titulo).toBe("Domicilio · Camila");
    // La dirección le gana al conteo: primero a dónde va, después cuánto lleva.
    expect(aviso.detalle).toBe("Cra 45 #12-30");
    expect(aviso.href).toBe("/domicilios");
  });

  it("sin dirección cae al conteo de productos", () => {
    const aviso = describirAviso({
      tipo: "DOMICILIO_NUEVO",
      orderId: "ord7",
      code: 418,
      cliente: "Camila",
      direccion: null,
      productos: 2,
      ts: TS,
    });

    expect(aviso.detalle).toBe("2 productos");
  });

  it("sin cliente queda el consecutivo", () => {
    const aviso = describirAviso({
      tipo: "DOMICILIO_NUEVO",
      orderId: "ord8",
      code: 419,
      cliente: null,
      direccion: "Calle 8 #2-40",
      productos: 1,
      ts: TS,
    });

    expect(aviso.titulo).toBe("Domicilio #419");
  });
});

describe("describirAviso · cuenta en la caja", () => {
  it("se lee igual que la comanda —mesa y cuenta— pero manda a la caja", () => {
    // A propósito el mismo título que el aviso de cocina: la misma cuenta vista
    // por dos personas distintas tiene que llamarse igual en las dos pantallas.
    const aviso = describirAviso({
      tipo: "CUENTA_EN_CAJA",
      orderId: "ord9",
      code: 420,
      mesa: "5",
      cuenta: "Andrés",
      turno: 7,
      productos: 3,
      totalCop: 15_000,
      ts: TS,
    });

    expect(aviso.titulo).toBe("Mesa 5 · Andrés");
    expect(aviso.href).toBe("/caja");
    expect(aviso.id).toBe(`ord9:CUENTA_EN_CAJA:${TS}`);
  });

  it("el detalle abre con la plata, que es lo que el cajero va a teclear", () => {
    const aviso = describirAviso({
      tipo: "CUENTA_EN_CAJA",
      orderId: "ord10",
      code: 421,
      mesa: "3",
      cuenta: null,
      turno: null,
      productos: 1,
      totalCop: 5_000,
      ts: TS,
    });

    expect(aviso.titulo).toBe("Mesa 3");
    expect(aviso.detalle).toBe("$5.000 · 1 producto");
  });

  it("una cuenta sin mesa —la del POS— se nombra por su turno", () => {
    const aviso = describirAviso({
      tipo: "CUENTA_EN_CAJA",
      orderId: "ord11",
      code: 422,
      mesa: null,
      cuenta: "Prueba mostrador",
      turno: 1,
      productos: 2,
      totalCop: 27_000,
      ts: TS,
    });

    expect(aviso.titulo).toBe("Turno 01 · Prueba mostrador");
    expect(aviso.detalle).toBe("$27.000 · 2 productos");
  });
});
