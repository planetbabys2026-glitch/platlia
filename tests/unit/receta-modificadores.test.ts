import { describe, expect, it, vi } from "vitest";
import {
  componerRecetaEfectiva,
  insumoQueFrena,
  porcionesSegunReceta,
} from "@/lib/inventory/receta";
import {
  calcularStockDisponibleCombinacion,
  calcularStockDisponibleProducto,
  auditarStockCarritoRecetas,
  verificarYDescontarStockReceta,
} from "@/lib/inventory/stock";

function insumo(id: string, stockCurrent: number, costCop = 0) {
  return { id, name: id, unit: "GRAMO", stockCurrent, costCop };
}

const arroz = insumo("arroz", 5000);
const pechuga = insumo("pechuga", 2000);
const res = insumo("res", 2000);

const menuDelDia = {
  hasRecipe: true,
  recipeNeedsModifiers: true,
  recipeItems: [{ quantityRequired: 100, inventoryItem: arroz }],
};

const opcionPollo = {
  id: "pollo",
  name: "Pollo",
  supplies: [{ quantityRequired: 150, inventoryItem: pechuga }],
};

const opcionCarne = {
  id: "carne",
  name: "Carne",
  supplies: [{ quantityRequired: 150, inventoryItem: res }],
};

/** Sin insumos propios, como el término de la carne. */
const opcionBienAsado = { id: "bien-asado", name: "Bien asado", supplies: [] };

describe("componerRecetaEfectiva", () => {
  it("junta la receta base con los insumos de la opción elegida", () => {
    const receta = componerRecetaEfectiva(menuDelDia, [opcionCarne]);
    expect(receta).toHaveLength(2);
    expect(receta.find((r) => r.inventoryItem.id === "arroz")?.quantityRequired).toBe(100);
    expect(receta.find((r) => r.inventoryItem.id === "res")?.quantityRequired).toBe(150);
    // La proteína no elegida no aparece.
    expect(receta.find((r) => r.inventoryItem.id === "pechuga")).toBeUndefined();
  });

  /**
   * El caso que evita vender de más: si base y modificador comparten insumo y
   * salieran como dos renglones, la verificación compararía cada uno por
   * separado contra el mismo stock y los dos pasarían.
   */
  it("suma por insumo cuando la base y un modificador comparten uno", () => {
    const conArrozExtra = {
      id: "doble-arroz",
      name: "Arroz extra",
      supplies: [{ quantityRequired: 50, inventoryItem: arroz }],
    };

    const receta = componerRecetaEfectiva(menuDelDia, [conArrozExtra]);
    expect(receta).toHaveLength(1);
    expect(receta[0].quantityRequired).toBe(150);
  });

  it("sin hasRecipe no incluye la receta base, pero sí los insumos del modificador", () => {
    const sinReceta = { ...menuDelDia, hasRecipe: false };
    const receta = componerRecetaEfectiva(sinReceta, [opcionCarne]);
    expect(receta).toHaveLength(1);
    expect(receta[0].inventoryItem.id).toBe("res");
  });

  it("una opción sin insumos no agrega nada", () => {
    const receta = componerRecetaEfectiva(menuDelDia, [opcionBienAsado]);
    expect(receta).toHaveLength(1);
    expect(receta[0].inventoryItem.id).toBe("arroz");
  });

  it("ignora renglones con cantidad cero", () => {
    const raro = {
      hasRecipe: true,
      recipeItems: [{ quantityRequired: 0, inventoryItem: arroz }],
    };
    expect(componerRecetaEfectiva(raro, [])).toHaveLength(0);
  });
});

describe("porcionesSegunReceta", () => {
  it("manda el insumo más escaso", () => {
    // arroz: 5000/100 = 50. res: 2000/150 = 13.
    expect(porcionesSegunReceta(componerRecetaEfectiva(menuDelDia, [opcionCarne]))).toBe(13);
  });

  it("null cuando la receta está vacía: no es cero, es 'no se mide'", () => {
    expect(porcionesSegunReceta([])).toBeNull();
  });
});

describe("insumoQueFrena", () => {
  it("nombra el insumo que no alcanza", () => {
    const receta = componerRecetaEfectiva(menuDelDia, [opcionCarne]);
    const frena = insumoQueFrena(receta, 100);
    expect(frena?.insumo.id).toBe("arroz");
    expect(frena?.requerido).toBe(10000);
  });

  it("null cuando alcanza para todo", () => {
    expect(insumoQueFrena(componerRecetaEfectiva(menuDelDia, [opcionCarne]), 5)).toBeNull();
  });
});

describe("calcularStockDisponibleProducto con modificadores", () => {
  const conGrupos = {
    ...menuDelDia,
    modifierGroups: [
      { required: true, group: { options: [opcionPollo, opcionCarne] } },
    ],
  };

  /**
   * El techo es optimista a propósito: mientras quede alguna proteína, el plato
   * se puede vender. Mostrar "0 disponibles" porque se acabó el pollo escondería
   * un plato que sale perfecto con carne.
   */
  it("toma la mejor opción disponible del grupo obligatorio", () => {
    const sinPollo = {
      ...conGrupos,
      modifierGroups: [
        {
          required: true,
          group: {
            options: [
              { ...opcionPollo, supplies: [{ quantityRequired: 150, inventoryItem: insumo("pechuga", 0) }] },
              opcionCarne,
            ],
          },
        },
      ],
    };

    // Pollo daría 0, carne da 13. Gana carne.
    expect(calcularStockDisponibleProducto(sinPollo)).toBe(13);
  });

  it("da cero cuando ninguna opción del grupo obligatorio alcanza", () => {
    const sinNada = {
      ...conGrupos,
      modifierGroups: [
        {
          required: true,
          group: {
            options: [
              { ...opcionPollo, supplies: [{ quantityRequired: 150, inventoryItem: insumo("pechuga", 0) }] },
              { ...opcionCarne, supplies: [{ quantityRequired: 150, inventoryItem: insumo("res", 0) }] },
            ],
          },
        },
      ],
    };

    expect(calcularStockDisponibleProducto(sinNada)).toBe(0);
  });

  it("un grupo opcional no recorta el techo", () => {
    const conOpcional = {
      ...menuDelDia,
      modifierGroups: [
        {
          required: false,
          group: {
            options: [
              { ...opcionCarne, supplies: [{ quantityRequired: 150, inventoryItem: insumo("res", 0) }] },
            ],
          },
        },
      ],
    };

    // Solo limita el arroz: 5000/100 = 50.
    expect(calcularStockDisponibleProducto(conOpcional)).toBe(50);
  });

  it("un grupo cuyas opciones no llevan insumos tampoco recorta", () => {
    const conTermino = {
      ...menuDelDia,
      modifierGroups: [{ required: true, group: { options: [opcionBienAsado] } }],
    };
    expect(calcularStockDisponibleProducto(conTermino)).toBe(50);
  });

  it("retorna null si inventoryEnabled es false (venta libre sin control de stock)", () => {
    expect(calcularStockDisponibleProducto(conGrupos, false)).toBeNull();
  });
});

describe("calcularStockDisponibleCombinacion", () => {
  it("cuenta exacto para lo que ya se eligió", () => {
    expect(calcularStockDisponibleCombinacion(menuDelDia, [opcionCarne])).toBe(13);
  });

  it("distingue una proteína agotada de otra que sí hay", () => {
    const sinPechuga = {
      ...opcionPollo,
      supplies: [{ quantityRequired: 150, inventoryItem: insumo("pechuga", 0) }],
    };
    expect(calcularStockDisponibleCombinacion(menuDelDia, [sinPechuga])).toBe(0);
    expect(calcularStockDisponibleCombinacion(menuDelDia, [opcionCarne])).toBe(13);
  });

  it("retorna null si inventoryEnabled es false", () => {
    const sinPechuga = {
      ...opcionPollo,
      supplies: [{ quantityRequired: 150, inventoryItem: insumo("pechuga", 0) }],
    };
    expect(calcularStockDisponibleCombinacion(menuDelDia, [sinPechuga], false)).toBeNull();
  });
});

describe("auditarStockCarritoRecetas con modificadores", () => {
  it("acumula la demanda de la misma proteína entre renglones distintos", () => {
    const carta = [{ products: [{ id: "menu", name: "Menú del día", ...menuDelDia }] }];

    // Dos renglones del mismo plato con carne: 2 x 150 = 300 g. Hay 2000: pasa.
    expect(
      auditarStockCarritoRecetas(
        [
          { productId: "menu", name: "Menú del día", quantity: 1, opciones: [opcionCarne] },
          { productId: "menu", name: "Menú del día", quantity: 1, opciones: [opcionCarne] },
        ],
        carta,
        true,
      ),
    ).toBeNull();

    // Siete + siete = 14 porciones x 150 = 2100 g de res. Hay 2000: no pasa.
    const error = auditarStockCarritoRecetas(
      [
        { productId: "menu", name: "Menú del día", quantity: 7, opciones: [opcionCarne] },
        { productId: "menu", name: "Menú del día", quantity: 7, opciones: [opcionCarne] },
      ],
      carta,
      true,
    );
    expect(error).toContain("res");
    expect(error).toContain("2100");
  });

  it("no mezcla proteínas distintas del mismo plato", () => {
    const carta = [{ products: [{ id: "menu", name: "Menú del día", ...menuDelDia }] }];

    // 10 con pollo (1500 g de pechuga) y 10 con carne (1500 g de res). Hay 2000
    // de cada uno: alcanza, porque no se suman entre sí.
    expect(
      auditarStockCarritoRecetas(
        [
          { productId: "menu", name: "Menú del día", quantity: 10, opciones: [opcionPollo] },
          { productId: "menu", name: "Menú del día", quantity: 10, opciones: [opcionCarne] },
        ],
        carta,
        true,
      ),
    ).toBeNull();
  });
});

describe("verificarYDescontarStockReceta con modificadores", () => {
  function mockTx(producto: Record<string, unknown>, opciones: unknown[] = []) {
    return {
      product: { findFirst: vi.fn().mockResolvedValue(producto), update: vi.fn() },
      modifierOption: { findMany: vi.fn().mockResolvedValue(opciones) },
      inventoryItem: { update: vi.fn().mockResolvedValue({}) },
      inventoryMovement: { create: vi.fn().mockResolvedValue({}) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("descuenta la receta base y el insumo de la opción elegida", async () => {
    const tx = mockTx(
      { id: "menu", name: "Menú del día", trackStock: false, stockQty: 0, ...menuDelDia },
      [opcionCarne],
    );

    await verificarYDescontarStockReceta(tx, "biz-1", "menu", 2, {
      referenceId: "order-1",
      inventoryEnabled: true,
      modifierOptionIds: ["carne"],
    });

    expect(tx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "arroz" },
      data: { stockCurrent: { decrement: 200 } },
    });
    expect(tx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "res" },
      data: { stockCurrent: { decrement: 300 } },
    });
    // La pechuga no se toca: no se eligió pollo.
    expect(tx.inventoryItem.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pechuga" } }),
    );
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(2);
  });

  it("no descuenta nada cuando el producto no lleva receta", async () => {
    const tx = mockTx({
      id: "gaseosa",
      name: "Gaseosa",
      trackStock: false,
      stockQty: 0,
      hasRecipe: false,
      recipeNeedsModifiers: false,
      recipeItems: [{ quantityRequired: 100, inventoryItem: arroz }],
    });

    await verificarYDescontarStockReceta(tx, "biz-1", "gaseosa", 3, { inventoryEnabled: true });

    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  /**
   * La red de seguridad del POST directo: el modal ya lo impide en la interfaz,
   * pero las Server Actions son alcanzables sin pasar por ella.
   */
  it("rechaza un producto que necesita modificadores si no llegó ninguno", async () => {
    const tx = mockTx({
      id: "menu",
      name: "Menú del día",
      trackStock: false,
      stockQty: 0,
      ...menuDelDia,
    });

    await expect(
      verificarYDescontarStockReceta(tx, "biz-1", "menu", 1, { inventoryEnabled: true }),
    ).rejects.toThrow(/Elegí los modificadores/);

    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
  });

  it("falla nombrando el insumo del modificador que no alcanza, sin escribir nada", async () => {
    const tx = mockTx(
      { id: "menu", name: "Menú del día", trackStock: false, stockQty: 0, ...menuDelDia },
      [{ ...opcionCarne, supplies: [{ quantityRequired: 150, inventoryItem: insumo("res", 100) }] }],
    );

    await expect(
      verificarYDescontarStockReceta(tx, "biz-1", "menu", 1, {
        inventoryEnabled: true,
        modifierOptionIds: ["carne"],
      }),
    ).rejects.toThrow(/res/);

    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("con un insumo compartido escribe un solo movimiento por la suma", async () => {
    const tx = mockTx(
      { id: "menu", name: "Menú del día", trackStock: false, stockQty: 0, ...menuDelDia },
      [{ id: "extra", name: "Arroz extra", supplies: [{ quantityRequired: 50, inventoryItem: arroz }] }],
    );

    await verificarYDescontarStockReceta(tx, "biz-1", "menu", 1, {
      inventoryEnabled: true,
      modifierOptionIds: ["extra"],
    });

    expect(tx.inventoryItem.update).toHaveBeenCalledTimes(1);
    expect(tx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "arroz" },
      data: { stockCurrent: { decrement: 150 } },
    });
  });

  it("no descuenta ni bloquea si inventoryEnabled es false", async () => {
    const tx = mockTx(
      { id: "menu", name: "Menú del día", trackStock: false, stockQty: 0, ...menuDelDia },
      [{ ...opcionCarne, supplies: [{ quantityRequired: 150, inventoryItem: insumo("res", 0) }] }],
    );

    await verificarYDescontarStockReceta(tx, "biz-1", "menu", 10, {
      inventoryEnabled: false,
      modifierOptionIds: ["carne"],
    });

    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });
});
