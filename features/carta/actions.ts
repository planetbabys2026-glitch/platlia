"use server";

import { revalidatePath } from "next/cache";
import { AppModule, Role } from "@/generated/prisma/enums";
import {
  archivarSchema,
  categoriaSchema,
  disponibilidadSchema,
  productoSchema,
  subirImagenSchema,
} from "@/features/carta/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { subirImagen } from "@/lib/images/cloudinary";

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

/**
 * Sube la foto de un producto y devuelve la URL. No toca el producto: guardarla
 * es responsabilidad de `guardarProducto`, al que el formulario le pasa la URL
 * que esta acción devolvió, en un campo más.
 */
export const subirImagenProducto = defineAction({
  schema: subirImagenSchema,
  roles: ADMINISTRAN,
  modulo: AppModule.PEDIDOS,
  async handler({ input, ctx }) {
    const buffer = Buffer.from(await input.file.arrayBuffer());
    const url = await subirImagen(buffer, `platlia/${ctx.business.slug}/productos`);
    return { url };
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
      shortDescription: input.shortDescription ?? null,
      description: input.description ?? null,
      sku: input.sku ?? null,
      imageUrl: input.imageUrl ?? null,
      priceCop: input.priceCop,
      kitchenStation: input.kitchenStation ?? null,
      preparationMinutes: input.preparationMinutes ?? null,
      sortOrder: input.sortOrder,
      hasRecipe: input.hasRecipe,
      recipeNeedsModifiers: input.recipeNeedsModifiers,
      // Los dos regímenes de stock son excluyentes: lo que se mide por sus
      // insumos no se mide además por unidades. Marcar la receta apaga el stock
      // directo acá y no en una validación aparte, porque el formulario de la
      // carta no muestra `trackStock` —lo enciende Inventario— y una regla que
      // vive en una pantalla que no existe no la aplica nadie.
      ...(input.hasRecipe ? { trackStock: false } : {}),
    };

    // Los grupos asignados se sincronizan junto con el producto: si el update
    // pasara y la asignación fallara, quedaría un producto marcado como "la
    // receta depende de los modificadores" sin un solo modificador, es decir,
    // imposible de vender.
    const producto = await db.$transaction(async (tx) => {
      const guardado = input.id
        ? await tx.product.update({ where: { id: input.id }, data: datos, select: { id: true } })
        : await tx.product.create({
            data: { businessId: ctx.business.id, ...datos },
            select: { id: true },
          });

      const elegidos = [...new Set(input.modifierGroupIds)];

      if (elegidos.length > 0) {
        const existen = await tx.modifierGroup.findMany({
          where: { id: { in: elegidos }, deletedAt: null },
          select: { id: true },
        });
        if (existen.length !== elegidos.length) {
          throw new ErrorDeUsuario("Alguno de los grupos de modificadores ya no existe.");
        }
      }

      await tx.productModifierGroup.deleteMany({
        where: { productId: guardado.id, ...(elegidos.length > 0 ? { groupId: { notIn: elegidos } } : {}) },
      });

      const yaAsignados = await tx.productModifierGroup.findMany({
        where: { productId: guardado.id },
        select: { groupId: true },
      });
      const yaAsignadosSet = new Set(yaAsignados.map((a) => a.groupId));

      for (const [indice, groupId] of elegidos.entries()) {
        const required = input.requiredModifierGroupIds.includes(groupId);
        if (yaAsignadosSet.has(groupId)) {
          await tx.productModifierGroup.updateMany({
            where: { productId: guardado.id, groupId },
            data: { required, sortOrder: indice },
          });
        } else {
          await tx.productModifierGroup.create({
            data: {
              businessId: ctx.business.id,
              productId: guardado.id,
              groupId,
              required,
              sortOrder: indice,
            },
          });
        }
      }

      return guardado;
    });

    revalidatePath("/administracion/carta");
    revalidatePath("/inventario");
    revalidatePath("/pos");
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
