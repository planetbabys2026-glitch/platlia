import { describe, expect, it, vi } from "vitest";
import { costoDeReceta, costoPromedioPonderado, costoUnitarioDeVenta } from "@/lib/inventory/costo";
import { verificarYDescontarStockReceta } from "@/lib/inventory/stock";
import { margenPorcentual } from "@/lib/money";

function insumo(id: string, stockCurrent: number, costCop = 0) {
  return { id, name: id, unit: "UNIDAD", stockCurrent, costCop };
}

describe("costoPromedioPonderado", () => {
  it("pondera la mercadería vieja con la nueva", () => {
    // 20 a $2.800 = $56.000 + 10 a $3.400 = $34.000 → $90.000 / 30 = $3.000
    expect(costoPromedioPonderado(20, 2800, 10, 3400)).toBe(3000);
  });

  it("con el stock en cero adopta el costo entrante", () => {
    expect(costoPromedioPonderado(0, 2800, 10, 3400)).toBe(3400);
  });

  it("con stock negativo no arrastra el faltante al promedio", () => {
    // El negativo sale de una venta con `permitirVentaSinStock`: es un faltante,
    // no mercadería que valga algo.
    expect(costoPromedioPonderado(-5, 2800, 10, 3400)).toBe(3400);
  });

  it("sin costo previo adopta el entrante en vez de promediar contra cero", () => {
    // Un `costCop` en cero casi nunca es "me lo regalaron": es "nadie le puso
    // precio". Promediar arrastraría el costo nuevo hacia abajo a ciegas.
    expect(costoPromedioPonderado(20, 0, 10, 3400)).toBe(3400);
  });

  it("una entrada de cero unidades no mueve el costo", () => {
    expect(costoPromedioPonderado(20, 2800, 0, 9999)).toBe(2800);
  });

  it("redondea a peso entero: assertCop rechaza los decimales", () => {
    // 3 a $1.000 + 1 a $1.001 = $4.001 / 4 = 1000,25
    expect(costoPromedioPonderado(3, 1000, 1, 1001)).toBe(1000);
    expect(Number.isInteger(costoPromedioPonderado(7, 333, 5, 777))).toBe(true);
  });
});

describe("costoDeReceta", () => {
  it("suma cada insumo por su cantidad requerida", () => {
    expect(
      costoDeReceta([
        { quantityRequired: 2, inventoryItem: insumo("pan", 100, 1500) },
        { quantityRequired: 1, inventoryItem: insumo("carne", 100, 4000) },
      ]),
    ).toBe(7000);
  });

  it("una receta vacía devuelve null, no cero", () => {
    // Cero llegaría al informe como margen del 100%.
    expect(costoDeReceta([])).toBeNull();
  });

  it("un insumo sin costo cargado cuenta como cero dentro de una receta que sí tiene", () => {
    expect(
      costoDeReceta([
        { quantityRequired: 1, inventoryItem: insumo("sal", 100) },
        { quantityRequired: 1, inventoryItem: insumo("carne", 100, 4000) },
      ]),
    ).toBe(4000);
  });
});

describe("costoUnitarioDeVenta", () => {
  it("con receta manda la receta", () => {
    expect(
      costoUnitarioDeVenta({
        trackStock: false,
        costCop: 0,
        receta: [{ quantityRequired: 2, inventoryItem: insumo("pan", 10, 1500) }],
      }),
    ).toBe(3000);
  });

  it("sin receta usa el costo propio del producto de reventa", () => {
    expect(costoUnitarioDeVenta({ trackStock: true, costCop: 2800, receta: [] })).toBe(2800);
  });

  it("un producto que no se costea devuelve null", () => {
    expect(costoUnitarioDeVenta({ trackStock: false, costCop: 0, receta: [] })).toBeNull();
    // Con stock directo pero sin costo cargado tampoco se inventa un cero.
    expect(costoUnitarioDeVenta({ trackStock: true, costCop: 0, receta: [] })).toBeNull();
  });
});

describe("margenPorcentual", () => {
  it("calcula la porción de la venta que se queda el negocio", () => {
    expect(margenPorcentual(11_600, 18_000)).toBe(64);
  });

  it("sin ventas devuelve null, no cero", () => {
    // Un 0% inventado se lee como "vendimos a pérdida" cuando no se vendió nada.
    expect(margenPorcentual(0, 0)).toBeNull();
  });

  it("admite margen negativo cuando se vendió por debajo del costo", () => {
    expect(margenPorcentual(-2_000, 10_000)).toBe(-20);
  });
});

describe("el costo que se congela en el renglón", () => {
  function txConProducto(producto: Record<string, unknown>) {
    return {
      product: {
        findFirst: vi.fn().mockResolvedValue(producto),
        update: vi.fn().mockResolvedValue({ stockQty: 5 }),
      },
      inventoryItem: { update: vi.fn().mockResolvedValue({ stockCurrent: 50 }) },
      inventoryMovement: { create: vi.fn().mockResolvedValue({}) },
      modifierOption: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as Parameters<typeof verificarYDescontarStockReceta>[0];
  }

  const cerveza = {
    id: "cerveza",
    name: "Cerveza Águila",
    trackStock: true,
    stockQty: 24,
    costCop: 2800,
    hasRecipe: false,
    recipeNeedsModifiers: false,
    recipeItems: [],
  };

  it("un producto de reventa congela su propio costo y deja Kardex", async () => {
    const tx = txConProducto(cerveza);

    const { unitCostCop } = await verificarYDescontarStockReceta(tx, "biz-1", "cerveza", 2, {
      referenceId: "order-1",
      inventoryEnabled: true,
    });

    expect(unitCostCop).toBe(2800);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "cerveza", stockQty: { gte: 2 } },
      data: { stockQty: { decrement: 2 } },
      select: { stockQty: true },
    });
    // El stock directo no tenía Kardex de ningún tipo: se movía en silencio.
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz-1",
        productId: "cerveza",
        type: "VENTA",
        quantity: -2,
        stockAfter: 5,
        unitCostCop: 2800,
        referenceId: "order-1",
        notes: "Venta de Cerveza Águila x2",
      },
    });
  });

  it("con el inventario apagado el costo es null, no cero", async () => {
    const tx = txConProducto(cerveza);

    const { unitCostCop } = await verificarYDescontarStockReceta(tx, "biz-1", "cerveza", 2, {
      inventoryEnabled: false,
    });

    expect(unitCostCop).toBeNull();
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("permitirVentaSinStock deja pasar la venta y el stock queda negativo", async () => {
    const tx = txConProducto({ ...cerveza, stockQty: 1 });

    await verificarYDescontarStockReceta(tx, "biz-1", "cerveza", 3, {
      inventoryEnabled: true,
      permitirVentaSinStock: true,
    });

    // Sin guarda en el `where`: el faltante tiene que quedar a la vista en el
    // arqueo, y un stock clavado en cero lo escondería.
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "cerveza" },
      data: { stockQty: { decrement: 3 } },
      select: { stockQty: true },
    });
  });

  it("sin el ajuste, vender más de lo que hay se rechaza nombrando el producto", async () => {
    const tx = txConProducto({ ...cerveza, stockQty: 1 });

    await expect(
      verificarYDescontarStockReceta(tx, "biz-1", "cerveza", 3, { inventoryEnabled: true }),
    ).rejects.toThrow(/Cerveza Águila/);

    expect(tx.product.update).not.toHaveBeenCalled();
  });
});
