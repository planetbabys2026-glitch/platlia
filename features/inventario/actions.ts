"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@/generated/prisma/enums";
import {
  crearFacturaCompraSchema,
  crearInsumoSchema,
  crearProveedorSchema,
  editarInsumoSchema,
  guardarRecetaSchema,
} from "@/features/inventario/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";

const PUEDEN_MANEJAR_INVENTARIO = [Role.ADMINISTRADOR, Role.CAJERO] as const;

/**
 * Carga de inventario inicial o nuevo insumo.
 */
export const crearInsumo = defineAction({
  schema: crearInsumoSchema,
  roles: PUEDEN_MANEJAR_INVENTARIO,
  async handler({ input, ctx, db }) {
    const item = await db.inventoryItem.create({
      data: {
        businessId: ctx.business.id,
        name: input.name,
        sku: input.sku ?? null,
        unit: input.unit,
        stockCurrent: input.stockCurrent,
        stockMin: input.stockMin,
        costCop: input.costCop,
      },
    });

    if (input.stockCurrent > 0) {
      await db.inventoryMovement.create({
        data: {
          businessId: ctx.business.id,
          inventoryItemId: item.id,
          type: "INICIAL",
          quantity: input.stockCurrent,
          stockAfter: input.stockCurrent,
          unitCostCop: input.costCop,
          notes: "Inventario inicial registrado",
        },
      });
    }

    revalidatePath("/inventario");
  },
});

/**
 * Editar datos o stock de insumo.
 */
export const editarInsumo = defineAction({
  schema: editarInsumoSchema,
  roles: PUEDEN_MANEJAR_INVENTARIO,
  async handler({ input, ctx, db }) {
    const prev = await db.inventoryItem.findUnique({
      where: { id: input.id },
    });
    if (!prev) throw new ErrorDeUsuario("El insumo no existe.");

    const item = await db.inventoryItem.update({
      where: { id: input.id },
      data: {
        name: input.name,
        sku: input.sku ?? null,
        unit: input.unit,
        stockCurrent: input.stockCurrent,
        stockMin: input.stockMin,
        costCop: input.costCop,
      },
    });

    if (prev.stockCurrent !== input.stockCurrent) {
      const diff = input.stockCurrent - prev.stockCurrent;
      await db.inventoryMovement.create({
        data: {
          businessId: ctx.business.id,
          inventoryItemId: item.id,
          type: "AJUSTE_MANUAL",
          quantity: diff,
          stockAfter: input.stockCurrent,
          unitCostCop: input.costCop,
          notes: "Ajuste manual de inventario",
        },
      });
    }

    revalidatePath("/inventario");
  },
});

/**
 * Registrar proveedor.
 */
export const crearProveedor = defineAction({
  schema: crearProveedorSchema,
  roles: PUEDEN_MANEJAR_INVENTARIO,
  async handler({ input, ctx, db }) {
    await db.supplier.create({
      data: {
        businessId: ctx.business.id,
        name: input.name,
        taxId: input.taxId ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
      },
    });

    revalidatePath("/inventario");
  },
});

/**
 * Registrar factura de compra (Entrada de mercadería/insumos).
 * Suma automáticamente al stock disponible y actualiza costos.
 */
export const crearFacturaCompra = defineAction({
  schema: crearFacturaCompraSchema,
  roles: PUEDEN_MANEJAR_INVENTARIO,
  async handler({ input, ctx, db }) {
    let lineas: Array<{
      inventoryItemId: string;
      quantity: number;
      unitCostCop: number;
      taxRateBp?: number;
    }> = [];

    try {
      lineas = JSON.parse(input.itemsJson);
    } catch {
      throw new ErrorDeUsuario("Los insumos de la factura tienen un formato inválido.");
    }

    if (!Array.isArray(lineas) || lineas.length === 0) {
      throw new ErrorDeUsuario("Agregá al menos un insumo a la factura de compra.");
    }

    let subtotal = 0;
    let totalTax = 0;

    const itemsProcesados = lineas.map((linea) => {
      const cant = Math.max(1, Math.round(Number(linea.quantity) || 1));
      const costo = Math.max(0, Math.round(Number(linea.unitCostCop) || 0));
      const taxBp = Math.max(0, Math.round(Number(linea.taxRateBp) || 0));

      let lineaSubtotal = cant * costo;
      let lineaTax = 0;

      if (taxBp > 0) {
        if (input.includesTax) {
          // El precio ya incluye impuesto
          const base = Math.round(lineaSubtotal / (1 + taxBp / 10000));
          lineaTax = lineaSubtotal - base;
          lineaSubtotal = base;
        } else {
          // El impuesto se suma al costo
          lineaTax = Math.round(lineaSubtotal * (taxBp / 10000));
        }
      }

      subtotal += lineaSubtotal;
      totalTax += lineaTax;

      return {
        inventoryItemId: linea.inventoryItemId,
        quantity: cant,
        unitCostCop: costo,
        taxRateBp: taxBp,
        totalCop: lineaSubtotal + lineaTax,
      };
    });

    const totalFactura = subtotal + totalTax;

    const factura = await db.purchaseInvoice.create({
      data: {
        businessId: ctx.business.id,
        supplierId: input.supplierId ?? null,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: new Date(input.invoiceDate),
        includesTax: input.includesTax,
        subtotalCop: subtotal,
        taxCop: totalTax,
        totalCop: totalFactura,
        notes: input.notes ?? null,
        items: {
          create: itemsProcesados.map((item) => ({
            businessId: ctx.business.id,
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unitCostCop: item.unitCostCop,
            taxRateBp: item.taxRateBp,
            totalCop: item.totalCop,
          })),
        },
      },
    });

    // Actualizar stock de insumos y registrar movimientos Kardex de COMPRA
    for (const item of itemsProcesados) {
      const insumo = await db.inventoryItem.findUnique({
        where: { id: item.inventoryItemId },
      });
      if (!insumo) continue;

      const nuevoStock = insumo.stockCurrent + item.quantity;

      await db.inventoryItem.update({
        where: { id: insumo.id },
        data: {
          stockCurrent: nuevoStock,
          costCop: item.unitCostCop, // Actualiza costo unitario con la compra recibida
        },
      });

      await db.inventoryMovement.create({
        data: {
          businessId: ctx.business.id,
          inventoryItemId: insumo.id,
          type: "COMPRA",
          quantity: item.quantity,
          stockAfter: nuevoStock,
          unitCostCop: item.unitCostCop,
          referenceId: factura.id,
          notes: `Factura de compra #${input.invoiceNumber}`,
        },
      });
    }

    revalidatePath("/inventario");
  },
});

/**
 * Guardar Receta / Escandallo por Producto.
 */
export const guardarReceta = defineAction({
  schema: guardarRecetaSchema,
  roles: PUEDEN_MANEJAR_INVENTARIO,
  async handler({ input, ctx, db }) {
    let items: Array<{ inventoryItemId: string; quantityRequired: number }> = [];

    try {
      items = JSON.parse(input.itemsJson);
    } catch {
      throw new ErrorDeUsuario("Formato de receta inválido.");
    }

    // Borra la receta anterior del producto
    await db.productRecipeItem.deleteMany({
      where: { productId: input.productId },
    });

    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (!item.inventoryItemId) continue;
        const cant = Math.max(1, Math.round(Number(item.quantityRequired) || 1));

        await db.productRecipeItem.create({
          data: {
            businessId: ctx.business.id,
            productId: input.productId,
            inventoryItemId: item.inventoryItemId,
            quantityRequired: cant,
          },
        });
      }
    }

    revalidatePath("/inventario");
  },
});
