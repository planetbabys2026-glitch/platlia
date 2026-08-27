"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@/generated/prisma/enums";
import {
  archivarModificadorSchema,
  grupoSchema,
  insumoDeOpcionSchema,
  insumosDeOpcionSchema,
  opcionSchema,
} from "@/features/modificadores/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";

const ADMINISTRAN = [Role.PROPIETARIO, Role.ADMINISTRADOR] as const;

/** Todo lo que se toca acá se ve en la carta y en el modal de venta. */
function revalidarCarta() {
  revalidatePath("/administracion/modificadores");
  revalidatePath("/administracion/carta");
  revalidatePath("/pos");
  revalidatePath("/inventario");
}

export const guardarGrupo = defineAction({
  schema: grupoSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    const repetido = await db.modifierGroup.findFirst({
      where: {
        name: input.name,
        deletedAt: null,
        ...(input.id ? { NOT: { id: input.id } } : {}),
      },
      select: { id: true },
    });
    if (repetido) throw new ErrorDeUsuario(`Ya hay un grupo que se llama "${input.name}".`);

    const datos = {
      name: input.name,
      helpText: input.helpText ?? null,
      minSelect: input.minSelect,
      maxSelect: input.maxSelect,
      sortOrder: input.sortOrder,
    };

    const grupo = input.id
      ? await db.modifierGroup.update({ where: { id: input.id }, data: datos, select: { id: true } })
      : await db.modifierGroup.create({
          data: { businessId: ctx.business.id, ...datos },
          select: { id: true },
        });

    revalidarCarta();
    return grupo;
  },
});

/**
 * Archiva el grupo sin tocar los renglones ya vendidos.
 *
 * Se desasigna de los productos —si no, seguiría apareciendo en el modal— pero
 * los `OrderItemModifier` de pedidos viejos no se tocan: llevan su propio
 * nombre congelado y no dependen de que el grupo siga existiendo.
 */
export const archivarGrupo = defineAction({
  schema: archivarModificadorSchema,
  roles: ADMINISTRAN,
  async handler({ input, db }) {
    await db.$transaction(async (tx) => {
      const grupo = await tx.modifierGroup.findFirst({
        where: { id: input.id, deletedAt: null },
        select: { id: true },
      });
      if (!grupo) throw new ErrorDeUsuario("Ese grupo no existe.");

      await tx.productModifierGroup.deleteMany({ where: { groupId: grupo.id } });
      await tx.modifierGroup.update({
        where: { id: grupo.id },
        data: { deletedAt: new Date(), active: false },
      });
    });

    revalidarCarta();
  },
});

export const guardarOpcion = defineAction({
  schema: opcionSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    const grupo = await db.modifierGroup.findFirst({
      where: { id: input.groupId, deletedAt: null },
      select: { id: true },
    });
    if (!grupo) throw new ErrorDeUsuario("Ese grupo no existe.");

    const repetida = await db.modifierOption.findFirst({
      where: {
        groupId: grupo.id,
        name: input.name,
        deletedAt: null,
        ...(input.id ? { NOT: { id: input.id } } : {}),
      },
      select: { id: true },
    });
    if (repetida) throw new ErrorDeUsuario(`Ese grupo ya tiene una opción "${input.name}".`);

    const datos = {
      name: input.name,
      priceDeltaCop: input.priceDeltaCop,
      isDefault: input.isDefault,
      sortOrder: input.sortOrder,
    };

    const opcion = input.id
      ? await db.modifierOption.update({
          where: { id: input.id },
          data: datos,
          select: { id: true },
        })
      : await db.modifierOption.create({
          data: { businessId: ctx.business.id, groupId: grupo.id, ...datos },
          select: { id: true },
        });

    revalidarCarta();
    return opcion;
  },
});

export const archivarOpcion = defineAction({
  schema: archivarModificadorSchema,
  roles: ADMINISTRAN,
  async handler({ input, db }) {
    const opcion = await db.modifierOption.findFirst({
      where: { id: input.id, deletedAt: null },
      select: { id: true },
    });
    if (!opcion) throw new ErrorDeUsuario("Esa opción no existe.");

    await db.modifierOption.update({
      where: { id: opcion.id },
      data: { deletedAt: new Date(), active: false },
    });

    revalidarCarta();
  },
});

/**
 * Reemplaza la lista de insumos de una opción.
 *
 * Va dentro de `$transaction` a propósito: `guardarReceta` hace este mismo
 * borrar-y-recrear en un bucle suelto, y un fallo a mitad deja la opción sin
 * insumos —es decir, descontando de menos en cada venta— sin que nadie se
 * entere hasta que no cuadra el inventario.
 */
export const guardarInsumosDeOpcion = defineAction({
  schema: insumosDeOpcionSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    let crudo: unknown;
    try {
      crudo = JSON.parse(input.itemsJson);
    } catch {
      throw new ErrorDeUsuario("Formato de insumos inválido.");
    }

    // A diferencia de `guardarReceta`, acá el JSON sí se valida con zod en vez de
    // sanearse a mano: un `quantityRequired` en cero pasa silencioso y deja la
    // opción sin descontar nada.
    const parseado = insumoDeOpcionSchema.array().safeParse(crudo);
    if (!parseado.success) {
      throw new ErrorDeUsuario(
        parseado.error.issues[0]?.message ?? "Revisá las cantidades de los insumos.",
      );
    }
    const items = parseado.data;

    // Dos renglones del mismo insumo violarían el @@unique. Se suman, que es lo
    // que la persona quiso decir.
    const porInsumo = new Map<string, number>();
    for (const item of items) {
      porInsumo.set(
        item.inventoryItemId,
        (porInsumo.get(item.inventoryItemId) ?? 0) + item.quantityRequired,
      );
    }

    await db.$transaction(async (tx) => {
      const opcion = await tx.modifierOption.findFirst({
        where: { id: input.optionId, deletedAt: null },
        select: { id: true },
      });
      if (!opcion) throw new ErrorDeUsuario("Esa opción no existe.");

      if (porInsumo.size > 0) {
        const existentes = await tx.inventoryItem.findMany({
          where: { id: { in: [...porInsumo.keys()] }, deletedAt: null },
          select: { id: true },
        });
        if (existentes.length !== porInsumo.size) {
          throw new ErrorDeUsuario("Alguno de los insumos elegidos ya no existe.");
        }
      }

      await tx.modifierOptionSupply.deleteMany({ where: { optionId: opcion.id } });

      for (const [inventoryItemId, quantityRequired] of porInsumo) {
        await tx.modifierOptionSupply.create({
          data: {
            businessId: ctx.business.id,
            optionId: opcion.id,
            inventoryItemId,
            quantityRequired,
          },
        });
      }
    });

    revalidarCarta();
  },
});
