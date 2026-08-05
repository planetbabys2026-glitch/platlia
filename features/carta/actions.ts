"use server";

import { revalidatePath } from "next/cache";
import { AppModule, Role } from "@/generated/prisma/enums";
import {
  archivarSchema,
  categoriaSchema,
  disponibilidadSchema,
  presentacionSchema,
  productoSchema,
} from "@/features/carta/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";

/**
 * Administración de la carta.
 *
 * Dos ideas gobiernan este archivo:
 *
 *  · **Nada se borra de verdad.** Un producto vendido vive en renglones de
 *    pedidos viejos, y aunque el renglón guarda su propia copia del nombre y del
 *    precio, la relación sigue ahí. Archivar (`deletedAt`) saca el producto de la
 *    carta sin tocar la historia; borrar rompería informes que ya se imprimieron.
 *  · **"Agotado" y "archivado" no son lo mismo.** `isAvailable` es hoy —se acabó
 *    la trucha— y lo cambia cualquiera desde el salón. `active`/`deletedAt` es el
 *    catálogo, y eso lo decide quien administra.
 */

const ADMINISTRAN = [Role.ADMINISTRADOR] as const;

export const guardarCategoria = defineAction({
  schema: categoriaSchema,
  roles: ADMINISTRAN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx, db }) {
    const duplicada = await db.category.findFirst({
      where: { name: input.name, deletedAt: null, ...(input.id ? { NOT: { id: input.id } } : {}) },
      select: { id: true },
    });
    if (duplicada) throw new ErrorDeUsuario(`Ya existe una categoría "${input.name}".`);

    const categoria = input.id
      ? await db.category.update({
          where: { id: input.id },
          data: { name: input.name, sortOrder: input.sortOrder },
          select: { id: true },
        })
      : await db.category.create({
          data: {
            businessId: ctx.business.id,
            name: input.name,
            sortOrder: input.sortOrder,
          },
          select: { id: true },
        });

    revalidatePath("/administracion/carta");
    return categoria;
  },
});

export const archivarCategoria = defineAction({
  schema: archivarSchema,
  roles: ADMINISTRAN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, db }) {
    const conProductos = await db.product.count({
      where: { categoryId: input.id, deletedAt: null },
    });
    if (conProductos > 0) {
      throw new ErrorDeUsuario(
        `Esa categoría todavía tiene ${conProductos} ${conProductos === 1 ? "producto" : "productos"}. Movelos o archivalos primero.`,
      );
    }

    await db.category.update({
      where: { id: input.id },
      data: { deletedAt: new Date(), active: false },
    });

    revalidatePath("/administracion/carta");
  },
});

export const guardarProducto = defineAction({
  schema: productoSchema,
  roles: ADMINISTRAN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx, db }) {
    const categoria = await db.category.findFirst({
      where: { id: input.categoryId, deletedAt: null },
      select: { id: true },
    });
    if (!categoria) throw new ErrorDeUsuario("Esa categoría no existe.");

    // Sin tarifa elegida va la que la empresa marcó por defecto. Un producto sin
    // tarifa no puede existir: el impuesto se congela al vender y necesita origen.
    let taxRateId = input.taxRateId;
    if (taxRateId) {
      const tarifa = await db.taxRate.findFirst({
        where: { id: taxRateId, active: true },
        select: { id: true },
      });
      if (!tarifa) throw new ErrorDeUsuario("Esa tarifa de impuesto no existe.");
    } else {
      const porDefecto = await db.taxRate.findFirst({
        where: { isDefault: true, active: true },
        select: { id: true },
      });
      if (!porDefecto) {
        throw new ErrorDeUsuario(
          "El negocio no tiene una tarifa de impuesto por defecto. Configurala antes de cargar productos.",
        );
      }
      taxRateId = porDefecto.id;
    }

    // El SKU es único por empresa cuando está presente; vacío se guarda como null
    // para que dos productos sin código no choquen entre sí.
    if (input.sku) {
      const repetido = await db.product.findFirst({
        where: { sku: input.sku, ...(input.id ? { NOT: { id: input.id } } : {}) },
        select: { id: true },
      });
      if (repetido) throw new ErrorDeUsuario(`Ya hay un producto con el código ${input.sku}.`);
    }

    const datos = {
      categoryId: input.categoryId,
      taxRateId,
      name: input.name,
      description: input.description ?? null,
      sku: input.sku ?? null,
      priceCop: input.priceCop,
      kitchenStation: input.kitchenStation ?? null,
      preparationMinutes: input.preparationMinutes ?? null,
      sortOrder: input.sortOrder,
    };

    const producto = input.id
      ? await db.product.update({ where: { id: input.id }, data: datos, select: { id: true } })
      : await db.product.create({
          data: { businessId: ctx.business.id, ...datos },
          select: { id: true },
        });

    revalidatePath("/administracion/carta");
    return producto;
  },
});

export const archivarProducto = defineAction({
  schema: archivarSchema,
  roles: ADMINISTRAN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, db }) {
    await db.product.update({
      where: { id: input.id },
      // El SKU se libera al archivar: si el producto vuelve con otro nombre, su
      // código tiene que poder reutilizarse.
      data: { deletedAt: new Date(), active: false, isAvailable: false, sku: null },
    });

    revalidatePath("/administracion/carta");
  },
});

/** Se acabó / volvió a haber. Lo toca cualquiera que atienda, no solo quien administra. */
export const cambiarDisponibilidad = defineAction({
  schema: disponibilidadSchema,
  roles: [Role.MESERO, Role.CAJERO, Role.ADMINISTRADOR],
  modulo: AppModule.PEDIDOS,
  async handler({ input, db }) {
    await db.product.update({
      where: { id: input.productId },
      data: { isAvailable: input.isAvailable },
    });

    revalidatePath("/administracion/carta");
    revalidatePath("/salon");
  },
});

export const guardarPresentacion = defineAction({
  schema: presentacionSchema,
  roles: ADMINISTRAN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx, db }) {
    const producto = await db.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: { id: true },
    });
    if (!producto) throw new ErrorDeUsuario("Ese producto no existe.");

    const repetida = await db.productVariant.findFirst({
      where: {
        productId: input.productId,
        name: input.name,
        ...(input.id ? { NOT: { id: input.id } } : {}),
      },
      select: { id: true },
    });
    if (repetida) {
      throw new ErrorDeUsuario(`Ese producto ya tiene una presentación "${input.name}".`);
    }

    const presentacion = input.id
      ? await db.productVariant.update({
          where: { id: input.id },
          data: { name: input.name, priceCop: input.priceCop },
          select: { id: true },
        })
      : await db.productVariant.create({
          data: {
            businessId: ctx.business.id,
            productId: input.productId,
            name: input.name,
            priceCop: input.priceCop,
          },
          select: { id: true },
        });

    revalidatePath("/administracion/carta");
    return presentacion;
  },
});

export const archivarPresentacion = defineAction({
  schema: archivarSchema,
  roles: ADMINISTRAN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, db }) {
    // La presentación no tiene deletedAt: se desactiva. Los renglones viejos la
    // referencian con onDelete: Restrict, así que borrarla fallaría igual.
    await db.productVariant.update({ where: { id: input.id }, data: { active: false } });
    revalidatePath("/administracion/carta");
  },
});
