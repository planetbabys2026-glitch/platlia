"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import {
  actualizarStockProductoTerminadoSchema,
  crearFacturaCompraSchema,
  itemRecetaSchema,
  lineaFacturaItemSchema,
  crearInsumoSchema,
  crearProductoTerminadoSchema,
  crearProveedorSchema,
  editarInsumoSchema,
  editarProductoTerminadoSchema,
  guardarRecetaSchema,
  UNIDAD_INSUMO,
} from "@/features/inventario/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { getSettings } from "@/features/negocio/queries";
import { costoPromedioPonderado } from "@/lib/inventory/costo";

const PUEDEN_MANEJAR_INVENTARIO = [Role.ADMINISTRADOR, Role.CAJERO] as const;

/**
 * El módulo tiene que estar encendido para escribir inventario.
 *
 * No alcanza con el rol: estas acciones son POST alcanzables con curl y hasta acá
 * corrían con el inventario apagado, dejando stock y movimientos en un negocio que
 * no lleva ninguno. No se usa `modulo: AppModule.INVENTARIO` de `defineAction`
 * porque ese enum se enciende entero al crear la empresa y nunca se apaga: el
 * interruptor real es el de Configuración.
 */
async function exigirInventarioActivo(businessId: string) {
  const settings = await getSettings(businessId);
  if (!settings.inventoryEnabled) {
    throw new ErrorDeUsuario(
      "El inventario no está activo para este negocio. Activalo en Configuración → Módulos.",
    );
  }
  return settings;
}

/**
 * Carga de inventario inicial o nuevo insumo.
 */
export const crearInsumo = defineAction({
  schema: crearInsumoSchema,
  roles: PUEDEN_MANEJAR_INVENTARIO,
  async handler({ input, ctx, db }) {
    await exigirInventarioActivo(ctx.business.id);

    const item = await db.inventoryItem.create({
      data: {
        businessId: ctx.business.id,
        name: input.name,
        // Todo insumo se mide en unidades: a cuánto equivale una lo dice el
        // nombre ("Carne molida 125 g"), que es lo único que el sistema puede
        // respetar sin convertir nada.
        unit: UNIDAD_INSUMO,
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
    await exigirInventarioActivo(ctx.business.id);

    const prev = await db.inventoryItem.findUnique({
      where: { id: input.id },
    });
    if (!prev) throw new ErrorDeUsuario("El insumo no existe.");

    const item = await db.inventoryItem.update({
      where: { id: input.id },
      data: {
        name: input.name,
        unit: UNIDAD_INSUMO,
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
    await exigirInventarioActivo(ctx.business.id);

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
 *
 * Suma al stock y **repondera el costo**. Antes pisaba `costCop` con el costo de
 * la última compra: diez cervezas caras un martes reevaluaban las veinte baratas
 * que ya estaban en la nevera, el inventario valía de golpe una plata que nadie
 * pagó y el margen saltaba sin que hubiera pasado nada en el negocio.
 *
 * Una línea entra por una de las dos puertas, que son los dos regímenes de stock:
 * `inventoryItemId` para un insumo de receta, `productId` para un producto de
 * reventa con stock directo. Nunca las dos.
 */
export const crearFacturaCompra = defineAction({
  schema: crearFacturaCompraSchema,
  roles: PUEDEN_MANEJAR_INVENTARIO,
  async handler({ input, ctx, db }) {
    await exigirInventarioActivo(ctx.business.id);

    let crudas: unknown;
    try {
      crudas = JSON.parse(input.itemsJson);
    } catch {
      throw new ErrorDeUsuario("Los insumos de la factura tienen un formato inválido.");
    }

    // El esquema existía y no validaba nada: las líneas se coercían a mano más
    // abajo, así que un `quantity` en texto o un costo negativo entraban derecho
    // a la base.
    const parseadas = z.array(lineaFacturaItemSchema).safeParse(crudas);
    if (!parseadas.success || parseadas.data.length === 0) {
      throw new ErrorDeUsuario(
        "Agregá al menos un insumo o producto válido a la factura de compra.",
      );
    }
    const lineas = parseadas.data;

    let subtotal = 0;
    let totalTax = 0;

    type LineaProcesada = {
      inventoryItemId: string | null;
      productId: string | null;
      quantity: number;
      /** Lo que se pagó por unidad, tal cual lo escribió quien carga la factura. */
      unitCostCop: number;
      /**
       * El mismo costo NETO de impuesto. Es el que queda como costo del insumo o
       * del producto, para que el margen compare base contra base: un costo con
       * IVA contra una venta con impuesto da un margen que no es de nadie.
       */
      unitCostNetoCop: number;
      taxRateBp: number;
      totalCop: number;
    };

    const itemsProcesados: LineaProcesada[] = [];

    for (const linea of lineas) {
      const cant = linea.quantity;
      const costo = linea.unitCostCop;
      const taxBp = linea.taxRateBp;
      const bruto = cant * costo;

      // Si el costo escrito ya trae el impuesto adentro se desagrega; si no, se
      // le suma encima. Misma aritmética que `computeTaxLine` de lib/tax.ts.
      let lineaSubtotal: number;
      let lineaTax: number;
      if (input.includesTax) {
        lineaSubtotal = Math.round((bruto * 10_000) / (10_000 + taxBp));
        lineaTax = bruto - lineaSubtotal;
      } else {
        lineaSubtotal = bruto;
        lineaTax = Math.round((bruto * taxBp) / 10_000);
      }

      subtotal += lineaSubtotal;
      totalTax += lineaTax;

      if (!linea.inventoryItemId && !linea.productId) {
        throw new ErrorDeUsuario(
          "Cada línea de la factura tiene que apuntar a un insumo o a un producto de reventa.",
        );
      }

      itemsProcesados.push({
        inventoryItemId: linea.inventoryItemId ?? null,
        // Si vienen los dos ids manda el insumo: sumarle stock a los dos
        // regímenes sería contar la misma mercadería dos veces.
        productId: linea.inventoryItemId ? null : (linea.productId ?? null),
        quantity: cant,
        unitCostCop: costo,
        unitCostNetoCop: cant > 0 ? Math.round(lineaSubtotal / cant) : 0,
        taxRateBp: taxBp,
        totalCop: lineaSubtotal + lineaTax,
      });
    }

    const totalFactura = subtotal + totalTax;

    // Todo adentro de una transacción: hasta acá la factura se guardaba primero y
    // el stock se aplicaba en un bucle aparte, así que un fallo a mitad de camino
    // dejaba una factura registrada con la mitad de la mercadería adentro.
    await db.$transaction(async (tx) => {
      const factura = await tx.purchaseInvoice.create({
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
            // `PurchaseInvoiceItem` cuelga de un insumo y su columna es
            // obligatoria, así que las líneas de producto directo no dejan
            // renglón de factura; su rastro es el movimiento de Kardex.
            create: itemsProcesados
              .filter((item): item is LineaProcesada & { inventoryItemId: string } =>
                item.inventoryItemId !== null,
              )
              .map((item) => ({
                businessId: ctx.business.id,
                inventoryItemId: item.inventoryItemId,
                quantity: item.quantity,
                unitCostCop: item.unitCostCop,
                taxRateBp: item.taxRateBp,
                totalCop: item.totalCop,
              })),
          },
        },
        select: { id: true },
      });

      for (const item of itemsProcesados) {
        if (item.inventoryItemId) {
          const insumo = await tx.inventoryItem.findFirst({
            where: { id: item.inventoryItemId, deletedAt: null },
            select: { id: true, stockCurrent: true, costCop: true },
          });
          if (!insumo) throw new ErrorDeUsuario("Uno de los insumos de la factura ya no existe.");

          const actualizado = await tx.inventoryItem.update({
            where: { id: insumo.id },
            data: {
              stockCurrent: { increment: item.quantity },
              costCop: costoPromedioPonderado(
                insumo.stockCurrent,
                insumo.costCop,
                item.quantity,
                item.unitCostNetoCop,
              ),
            },
            select: { stockCurrent: true },
          });

          // Comprar arroz sube el arroz y nada más. Antes, si la línea no traía
          // producto, se buscaba CUALQUIER plato que tuviera ese insumo en su
          // receta y se le subía el `stockQty`: una bolsa de arroz fabricaba
          // bandejas paisas de la nada.
          await tx.inventoryMovement.create({
            data: {
              businessId: ctx.business.id,
              inventoryItemId: insumo.id,
              type: "COMPRA",
              quantity: item.quantity,
              stockAfter: actualizado.stockCurrent,
              unitCostCop: item.unitCostNetoCop,
              referenceId: factura.id,
              notes: `Factura de compra #${input.invoiceNumber}`,
            },
          });
          continue;
        }

        const producto = await tx.product.findFirst({
          where: { id: item.productId as string, deletedAt: null },
          select: { id: true, name: true, stockQty: true, costCop: true, hasRecipe: true },
        });
        if (!producto) throw new ErrorDeUsuario("Uno de los productos de la factura ya no existe.");
        if (producto.hasRecipe) {
          throw new ErrorDeUsuario(
            `"${producto.name}" lleva receta: se compran sus insumos, no el producto terminado.`,
          );
        }

        const actualizado = await tx.product.update({
          where: { id: producto.id },
          data: {
            trackStock: true,
            stockQty: { increment: item.quantity },
            costCop: costoPromedioPonderado(
              producto.stockQty,
              producto.costCop,
              item.quantity,
              item.unitCostNetoCop,
            ),
          },
          select: { stockQty: true },
        });

        await tx.inventoryMovement.create({
          data: {
            businessId: ctx.business.id,
            productId: producto.id,
            type: "COMPRA",
            quantity: item.quantity,
            stockAfter: actualizado.stockQty,
            unitCostCop: item.unitCostNetoCop,
            referenceId: factura.id,
            notes: `Factura de compra #${input.invoiceNumber}`,
          },
        });
      }
    });

    revalidatePath("/inventario");
    revalidatePath("/pos");
  },
});

/**
 * Guardar Receta / Escandallo por Producto.
 *
 * Guardar una receta apaga el stock directo del producto: los dos regímenes son
 * excluyentes, y un producto que se mide por sus insumos no se mide además por
 * unidades sueltas.
 */
export const guardarReceta = defineAction({
  schema: guardarRecetaSchema,
  roles: PUEDEN_MANEJAR_INVENTARIO,
  async handler({ input, ctx, db }) {
    await exigirInventarioActivo(ctx.business.id);

    let crudos: unknown;
    try {
      crudos = JSON.parse(input.itemsJson);
    } catch {
      throw new ErrorDeUsuario("Formato de receta inválido.");
    }

    const parseados = z.array(itemRecetaSchema).safeParse(crudos);
    if (!parseados.success) {
      throw new ErrorDeUsuario("Alguna línea de la receta tiene una cantidad inválida.");
    }
    const items = parseados.data;

    await db.$transaction(async (tx) => {
      const producto = await tx.product.findFirst({
        where: { id: input.productId, deletedAt: null },
        select: { id: true },
      });
      if (!producto) throw new ErrorDeUsuario("Ese producto no existe.");

      await tx.productRecipeItem.deleteMany({ where: { productId: producto.id } });

      for (const item of items) {
        await tx.productRecipeItem.create({
          data: {
            businessId: ctx.business.id,
            productId: producto.id,
            inventoryItemId: item.inventoryItemId,
            quantityRequired: item.quantityRequired,
          },
        });
      }

      // Con receta cargada, el `stockQty` que hubiera quedado de antes deja de
      // contar: si no, el producto tendría dos disponibilidades distintas y cada
      // pantalla mostraría la que le tocara mirar.
      if (items.length > 0) {
        await tx.product.update({
          where: { id: producto.id },
          data: { trackStock: false, stockQty: 0 },
        });
      }
    });

    revalidatePath("/inventario");
    revalidatePath("/pos");
  },
});

/**
 * Ajuste manual del stock de un producto de reventa (cervezas, gaseosas).
 *
 * Deja movimiento de Kardex, que antes no dejaba ninguno: el `stockQty` se movía
 * en silencio y cuando el conteo físico no cuadraba no había nada que revisar.
 */
export const actualizarStockProductoTerminado = defineAction({
  schema: actualizarStockProductoTerminadoSchema,
  roles: PUEDEN_MANEJAR_INVENTARIO,
  async handler({ input, ctx, db }) {
    await exigirInventarioActivo(ctx.business.id);

    await db.$transaction(async (tx) => {
      const previo = await tx.product.findFirst({
        where: { id: input.productId, deletedAt: null },
        select: { id: true, name: true, stockQty: true, costCop: true, hasRecipe: true },
      });
      if (!previo) throw new ErrorDeUsuario("Ese producto no existe.");
      if (previo.hasRecipe) {
        throw new ErrorDeUsuario(
          `"${previo.name}" lleva receta: su disponibilidad sale de los insumos, no de un stock propio.`,
        );
      }

      await tx.product.update({
        where: { id: previo.id },
        data: { trackStock: true, stockQty: input.stockQty },
      });

      if (previo.stockQty !== input.stockQty) {
        await tx.inventoryMovement.create({
          data: {
            businessId: ctx.business.id,
            productId: previo.id,
            type: "AJUSTE_MANUAL",
            quantity: input.stockQty - previo.stockQty,
            stockAfter: input.stockQty,
            unitCostCop: previo.costCop,
            notes: "Ajuste manual de stock de producto de reventa",
          },
        });
      }
    });

    revalidatePath("/inventario");
    revalidatePath("/pos");
  },
});

/**
 * Alta rápida de bebida o producto de reventa: costo de compra, precio de venta,
 * stock inicial, mínimo de reposición y categoría.
 *
 * **No crea insumo espejo.** Antes creaba el `Product` con `stockQty` Y un
 * `InventoryItem` con `stockCurrent` unidos por una receta 1:1, sin marcar
 * `hasRecipe`: la venta descontaba solo el primero, la compra subía los dos, y el
 * insumo trepaba para siempre inflando la valorización del inventario. Una cerveza
 * es una cosa y se cuenta en un lugar.
 */
export const crearProductoTerminado = defineAction({
  schema: crearProductoTerminadoSchema,
  roles: PUEDEN_MANEJAR_INVENTARIO,
  async handler({ input, ctx, db }) {
    await exigirInventarioActivo(ctx.business.id);

    let taxRateId = (
      await db.taxRate.findFirst({
        where: { isDefault: true, active: true },
        select: { id: true },
      })
    )?.id;

    if (!taxRateId) {
      const anyTax = await db.taxRate.findFirst({
        where: { active: true },
        select: { id: true },
      });
      taxRateId = anyTax?.id;
    }

    if (!taxRateId) {
      const newTax = await db.taxRate.create({
        data: {
          businessId: ctx.business.id,
          name: "Impoconsumo 8%",
          kind: "IMPOCONSUMO",
          rateBp: 800,
          isDefault: true,
        },
        select: { id: true },
      });
      taxRateId = newTax.id;
    }

    await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          businessId: ctx.business.id,
          categoryId: input.categoryId,
          taxRateId,
          name: input.name,
          sku: input.sku,
          priceCop: input.priceCop,
          trackStock: true,
          hasRecipe: false,
          stockQty: input.stockQty,
          stockMin: input.stockMin,
          costCop: input.costCop,
        },
        select: { id: true },
      });

      if (input.stockQty > 0) {
        await tx.inventoryMovement.create({
          data: {
            businessId: ctx.business.id,
            productId: product.id,
            type: "INICIAL",
            quantity: input.stockQty,
            stockAfter: input.stockQty,
            unitCostCop: input.costCop,
            notes: "Stock inicial registrado",
          },
        });
      }
    });

    revalidatePath("/inventario");
    revalidatePath("/pos");
    revalidatePath("/administracion/menu");
  },
});

/**
 * Edición de nombre, categoría, costo, precio y stock de un producto de reventa.
 */
export const editarProductoTerminado = defineAction({
  schema: editarProductoTerminadoSchema,
  roles: PUEDEN_MANEJAR_INVENTARIO,
  async handler({ input, ctx, db }) {
    await exigirInventarioActivo(ctx.business.id);

    await db.$transaction(async (tx) => {
      const previo = await tx.product.findFirst({
        where: { id: input.productId, deletedAt: null },
        select: { id: true, name: true, stockQty: true, costCop: true, hasRecipe: true },
      });
      if (!previo) throw new ErrorDeUsuario("Ese producto no existe.");
      if (previo.hasRecipe) {
        throw new ErrorDeUsuario(
          `"${previo.name}" lleva receta: editalo desde la carta y ajustá sus insumos.`,
        );
      }

      await tx.product.update({
        where: { id: previo.id },
        data: {
          name: input.name,
          categoryId: input.categoryId,
          sku: input.sku,
          priceCop: input.priceCop,
          trackStock: true,
          stockQty: input.stockQty,
          stockMin: input.stockMin,
          // El costo escrito a mano manda sobre el promedio ponderado: es una
          // corrección deliberada, no una compra.
          costCop: input.costCop,
        },
      });

      if (previo.stockQty !== input.stockQty) {
        await tx.inventoryMovement.create({
          data: {
            businessId: ctx.business.id,
            productId: previo.id,
            type: "AJUSTE_MANUAL",
            quantity: input.stockQty - previo.stockQty,
            stockAfter: input.stockQty,
            unitCostCop: input.costCop,
            notes: `Edición de "${input.name}"`,
          },
        });
      }
    });

    revalidatePath("/inventario");
    revalidatePath("/pos");
    revalidatePath("/administracion/menu");
  },
});
