import { describe, expect, it } from "vitest";
import {
  componerComanda,
  type ItemDeComanda,
  type PedidoDeComanda,
} from "@/lib/printing/comanda";

/**
 * La comanda que sale por la impresora de la cocina.
 *
 * Lo que se prueba acá no es la estética: es que quien cocina pueda leer qué,
 * cuánto y cómo sin que le estorben los precios, y que la comanda se pueda
 * identificar de lejos entre otras seis colgadas en la plancha.
 */

const ANCHO = 48;

const PEDIDO: PedidoDeComanda = {
  code: 42,
  type: "MESA",
  turnNumber: null,
  customerName: "Andrés",
  deliveryAddress: null,
  openedAt: new Date("2026-08-19T18:30:00Z"),
  openedBy: { name: "Jhon Torres" },
  table: { name: "12" },
};

const ITEMS: ItemDeComanda[] = [
  {
    quantity: 2,
    nameSnapshot: "Bandeja paisa",
    notes: "sin cebolla",
    modifiers: [{ optionNameSnapshot: "Bien asado" }],
  },
  { quantity: 1, nameSnapshot: "Limonada natural", notes: null, modifiers: [] },
];

const opciones = { ancho: ANCHO, zona: "America/Bogota", estacion: "Cocina" };

describe("componerComanda", () => {
  it("no lleva precios", () => {
    // Es la diferencia con el recibo: a la plancha el dinero no le sirve de nada
    // y le quita lugar a lo que sí.
    const texto = componerComanda(PEDIDO, ITEMS, opciones).join("\n");
    expect(texto).not.toMatch(/\$/);
    expect(texto).not.toMatch(/TOTAL/i);
  });

  it("la primera línea identifica el pedido, para que salga en grande", () => {
    // `componerEscPos` imprime en letra grande las primeras N líneas: si el
    // identificador no es la línea 1, sale grande cualquier otra cosa.
    const lineas = componerComanda(PEDIDO, ITEMS, opciones);
    expect(lineas[0]).toContain("MESA 12");
  });

  it("un domicilio se identifica como domicilio y trae la dirección", () => {
    const lineas = componerComanda(
      {
        ...PEDIDO,
        type: "DOMICILIO",
        table: null,
        deliveryAddress: "Calle Falsa 123",
      },
      ITEMS,
      opciones,
    );
    expect(lineas[0]).toContain("DOMICILIO #42");
    // Quien empaca necesita saber que va para afuera antes de terminar.
    expect(lineas.join("\n")).toContain("CALLE FALSA 123");
  });

  it("un pedido para llevar se identifica por su turno", () => {
    const lineas = componerComanda(
      { ...PEDIDO, type: "LLEVAR", table: null, turnNumber: 7 },
      ITEMS,
      opciones,
    );
    expect(lineas[0]).toContain("TURNO 7");
  });

  it("sin mesa ni turno cae en el número de pedido, no en nada", () => {
    const lineas = componerComanda(
      { ...PEDIDO, type: "LLEVAR", table: null, turnNumber: null },
      ITEMS,
      opciones,
    );
    expect(lineas[0]).toContain("PEDIDO #42");
  });

  it("lleva cantidad, modificadores y notas de cada renglón", () => {
    const texto = componerComanda(PEDIDO, ITEMS, opciones).join("\n");
    expect(texto).toContain("2X BANDEJA PAISA");
    expect(texto).toContain("BIEN ASADO");
    // La nota va marcada: "sin cebolla" perdido entre renglones es un plato que
    // vuelve a la cocina.
    expect(texto).toContain(">> SIN CEBOLLA");
  });

  it("dice a qué estación pertenece", () => {
    // Un bar con parrilla y barra imprime dos comandas del mismo pedido: sin
    // esto, las dos se ven iguales.
    expect(componerComanda(PEDIDO, ITEMS, { ...opciones, estacion: "Barra" }).join("\n")).toContain(
      "BARRA",
    );
  });

  it("ninguna línea se pasa del ancho del rollo", () => {
    // Una línea más larga que el papel la parte la impresora donde le queda, y
    // ahí se descuadra todo lo de abajo.
    for (const ancho of [32, 48]) {
      const lineas = componerComanda(
        { ...PEDIDO, customerName: "Un nombre larguísimo que no entra de ninguna manera acá" },
        [
          {
            quantity: 3,
            nameSnapshot: "Churrasco con papas a la francesa y ensalada de la casa",
            notes: "muy poco sal por favor y sin tomate en la ensalada",
            modifiers: [{ optionNameSnapshot: "Término tres cuartos" }],
          },
        ],
        { ...opciones, ancho },
      );
      for (const linea of lineas) {
        expect(linea.length).toBeLessThanOrEqual(ancho);
      }
    }
  });

  it("cierra con el número de pedido, para poder cotejarlo", () => {
    const lineas = componerComanda(PEDIDO, ITEMS, opciones);
    expect(lineas[lineas.length - 1]).toContain("PEDIDO #42");
  });
});

/**
 * Lo que hace legible un papel colgado en la plancha: letra grande, caja alta y
 * saber a quién llamar. Es una comanda que se lee de pie, a un metro y con las
 * manos ocupadas — no una pantalla.
 */
describe("la comanda se lee de lejos", () => {
  it("sale entera en mayúsculas, incluido lo que el mesero escribió a mano", () => {
    const lineas = componerComanda(
      PEDIDO,
      [
        {
          quantity: 1,
          nameSnapshot: "Bandeja paisa",
          notes: "sin cebolla, término medio",
          modifiers: [{ optionNameSnapshot: "arroz extra" }],
        },
      ],
      opciones,
    );

    const texto = lineas.join("\n");
    expect(texto).toBe(texto.toUpperCase());
    expect(texto).toContain("SIN CEBOLLA, TÉRMINO MEDIO");
    expect(texto).toContain("ARROZ EXTRA");
  });

  /**
   * A quién llama la cocina cuando algo no cuadra. Con seis comandas colgadas,
   * "preguntale al mesero" no alcanza.
   */
  it("dice quién tomó el pedido", () => {
    const texto = componerComanda(PEDIDO, ITEMS, opciones).join("\n");
    expect(texto).toContain("MESERO: JHON TORRES");
  });

  it("sin mesero registrado no inventa una línea vacía", () => {
    const texto = componerComanda({ ...PEDIDO, openedBy: null }, ITEMS, opciones).join("\n");
    expect(texto).not.toContain("MESERO:");
  });
});
