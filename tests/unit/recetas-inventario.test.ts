import { describe, expect, it, vi } from "vitest";
import {
  ajustarStockCantidadReceta,
  auditarStockCarritoRecetas,
  calcularStockDisponibleProducto,
  restaurarStockReceta,
  verificarYDescontarStockReceta,
} from "@/lib/inventory/stock";

/** Un insumo de prueba con lo mínimo que las funciones necesitan leer. */
function insumo(id: string, stockCurrent: number, costCop = 0) {
  return { id, name: id, unit: "UNIDAD", stockCurrent, costCop };
}

describe("Verificación y Control de Stock de Recetas (Escandallos)", () => {
  it("descuenta stock e inserta Kardex VENTA cuando hay stock suficiente de insumos", async () => {
    const mockTx = {
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: "prod-1",
          name: "Hamburguesa Especial",
          trackStock: false,
          stockQty: 0,
          hasRecipe: true,
          recipeNeedsModifiers: false,
          recipeItems: [
            {
              quantityRequired: 2,
              inventoryItem: {
                id: "insumo-1",
                name: "Pan Hamburguesa",
                unit: "UNIDAD",
                stockCurrent: 10,
                costCop: 1500,
              },
            },
          ],
        }),
        update: vi.fn(),
      },
      inventoryItem: {
        // El descuento lee el saldo del propio update, no de una resta sobre la
        // lectura vieja: con dos ventas simultáneas esa resta escribía un número
        // que nunca existió.
        update: vi.fn().mockResolvedValue({ stockCurrent: 4 }),
      },
      inventoryMovement: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Parameters<typeof verificarYDescontarStockReceta>[0];

    const { unitCostCop } = await verificarYDescontarStockReceta(mockTx, "biz-1", "prod-1", 3, {
      referenceId: "order-1",
      inventoryEnabled: true,
    });

    // 2 panes por hamburguesa a $1.500: el costo que se congela en el renglón.
    expect(unitCostCop).toBe(3000);

    // Stock requerido: 2 * 3 = 6. La guarda va en el `where`, que es lo que hace
    // el descuento atómico frente a dos meseros tocando a la vez.
    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "insumo-1", stockCurrent: { gte: 6 } },
      data: { stockCurrent: { decrement: 6 } },
      select: { stockCurrent: true },
    });

    expect(mockTx.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz-1",
        inventoryItemId: "insumo-1",
        type: "VENTA",
        quantity: -6,
        stockAfter: 4,
        unitCostCop: 1500,
        referenceId: "order-1",
        notes: "Venta de Hamburguesa Especial x3",
      },
    });
  });

  it("lanza un ErrorDeUsuario si el stock de insumos es insuficiente", async () => {
    const mockTx = {
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: "prod-1",
          name: "Hamburguesa Especial",
          trackStock: false,
          stockQty: 0,
          hasRecipe: true,
          recipeNeedsModifiers: false,
          recipeItems: [
            {
              quantityRequired: 2,
              inventoryItem: {
                id: "insumo-1",
                name: "Pan Hamburguesa",
                unit: "UNIDAD",
                stockCurrent: 3, // Solo hay 3, pero se piden 3 hamburguesas (requieren 6)
                costCop: 1500,
              },
            },
          ],
        }),
      },
      inventoryItem: { update: vi.fn() },
      inventoryMovement: { create: vi.fn() },
    } as unknown as Parameters<typeof verificarYDescontarStockReceta>[0];

    await expect(
      verificarYDescontarStockReceta(mockTx, "biz-1", "prod-1", 3, {
        referenceId: "order-1",
        inventoryEnabled: true,
      }),
    ).rejects.toThrow(
      'Stock insuficiente del insumo "Pan Hamburguesa" para preparar "Hamburguesa Especial". Requerido: 6 UNIDAD, disponible en inventario: 3 UNIDAD.',
    );

    expect(mockTx.inventoryItem.update).not.toHaveBeenCalled();
    expect(mockTx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("restaura stock de insumos e inserta Kardex DEVOLUCION al anular", async () => {
    const mockTx = {
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: "prod-1",
          name: "Hamburguesa Especial",
          trackStock: false,
          hasRecipe: true,
          recipeNeedsModifiers: false,
          recipeItems: [
            {
              quantityRequired: 2,
              inventoryItem: {
                id: "insumo-1",
                name: "Pan Hamburguesa",
                unit: "UNIDAD",
                stockCurrent: 4,
                costCop: 1500,
              },
            },
          ],
        }),
      },
      inventoryItem: {
        update: vi.fn().mockResolvedValue({ stockCurrent: 8 }),
      },
      inventoryMovement: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as unknown as Parameters<typeof restaurarStockReceta>[0];

    await restaurarStockReceta(mockTx, "biz-1", "prod-1", 2, {
      referenceId: "order-1",
      inventoryEnabled: true,
      customNotes: "Anulación de pedido #12",
    });

    // Se devuelven 2 * 2 = 4 unidades. Stock nuevo: 4 + 4 = 8.
    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "insumo-1" },
      data: { stockCurrent: { increment: 4 } },
      select: { stockCurrent: true },
    });

    expect(mockTx.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz-1",
        inventoryItemId: "insumo-1",
        type: "DEVOLUCION",
        quantity: 4,
        stockAfter: 8,
        unitCostCop: 1500,
        referenceId: "order-1",
        notes: "Anulación de pedido #12",
      },
    });
  });

  it("ajusta stock correctamente ante cambios de cantidad (aumento y reducción)", async () => {
    const mockTx = {
      product: {
        findFirst: vi.fn().mockResolvedValue({
          id: "prod-1",
          name: "Hamburguesa Especial",
          trackStock: false,
          hasRecipe: true,
          recipeNeedsModifiers: false,
          recipeItems: [
            {
              quantityRequired: 1,
              inventoryItem: {
                id: "insumo-1",
                name: "Carne",
                unit: "PORCION",
                stockCurrent: 10,
                costCop: 3000,
              },
            },
          ],
        }),
      },
      inventoryItem: { update: vi.fn().mockResolvedValue({ stockCurrent: 7 }) },
      inventoryMovement: { create: vi.fn() },
    } as unknown as Parameters<typeof ajustarStockCantidadReceta>[0];

    // Aumento de cantidad: de 2 a 5 (+3 porciones)
    await ajustarStockCantidadReceta(mockTx, "biz-1", "prod-1", 2, 5, {
      referenceId: "order-1",
      inventoryEnabled: true,
    });

    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "insumo-1", stockCurrent: { gte: 3 } },
      data: { stockCurrent: { decrement: 3 } },
      select: { stockCurrent: true },
    });

    // Reducción de cantidad: de 5 a 3 (-2 porciones devueltas)
    (mockTx.product.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "prod-1",
      name: "Hamburguesa Especial",
      trackStock: false,
      hasRecipe: true,
      recipeNeedsModifiers: false,
      recipeItems: [
        {
          quantityRequired: 1,
          inventoryItem: {
            id: "insumo-1",
            name: "Carne",
            unit: "PORCION",
            stockCurrent: 7,
            costCop: 3000,
          },
        },
      ],
    });

    await ajustarStockCantidadReceta(mockTx, "biz-1", "prod-1", 5, 3, {
      referenceId: "order-1",
      inventoryEnabled: true,
    });

    expect(mockTx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: "insumo-1" },
      data: { stockCurrent: { increment: 2 } },
      select: { stockCurrent: true },
    });
  });

  it("calcula correctamente las porciones preparables según los insumos de la receta", () => {
    // 10 panes (requiere 2 c/u -> 5), 8 carnes (requiere 1 c/u -> 8), 12 quesos (requiere 3 c/u -> 4) -> Mínimo = 4 porciones
    const res = calcularStockDisponibleProducto({
      hasRecipe: true,
      recipeItems: [
        { quantityRequired: 2, inventoryItem: insumo("pan", 10) },
        { quantityRequired: 1, inventoryItem: insumo("carne", 8) },
        { quantityRequired: 3, inventoryItem: insumo("queso", 12) },
      ],
    });
    expect(res).toBe(4);
  });

  it("retorna 0 si falta algún insumo de la receta", () => {
    const res = calcularStockDisponibleProducto({
      hasRecipe: true,
      recipeItems: [
        { quantityRequired: 1, inventoryItem: insumo("pan", 5) },
        { quantityRequired: 1, inventoryItem: insumo("carne", 0) },
      ],
    });
    expect(res).toBe(0);
  });

  it("retorna null si no rastrea recetas ni stock de producto", () => {
    const res = calcularStockDisponibleProducto({
      trackStock: false,
      recipeItems: [],
    });
    expect(res).toBeNull();
  });

  it("audita correctamente el stock acumulado de insumos de todo el carrito", () => {
    const cartaMock = [
      {
        products: [
          {
            id: "p1",
            name: "Hamburguesa Sencilla",
            hasRecipe: true,
            recipeItems: [
              { quantityRequired: 1, inventoryItem: { id: "pan", name: "Pan Hamburguesa", unit: "UNIDAD", stockCurrent: 3 } },
            ],
          },
          {
            id: "p2",
            name: "Hamburguesa Doble",
            hasRecipe: true,
            recipeItems: [
              { quantityRequired: 2, inventoryItem: { id: "pan", name: "Pan Hamburguesa", unit: "UNIDAD", stockCurrent: 3 } },
            ],
          },
        ],
      },
    ] as unknown as Parameters<typeof auditarStockCarritoRecetas>[1];

    // 2 sencillas (requiere 2 panes) + 1 doble (requiere 2 panes) = 4 panes requeridos. Stock actual: 3.
    const cart = [
      { productId: "p1", name: "Hamburguesa Sencilla", quantity: 2 },
      { productId: "p2", name: "Hamburguesa Doble", quantity: 1 },
    ];

    const error = auditarStockCarritoRecetas(cart, cartaMock, true);
    expect(error).toContain("Pan Hamburguesa");
    expect(error).toContain("Requerido total: 4 UNIDAD");
  });
});
