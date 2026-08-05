"use server";

import { revalidatePath } from "next/cache";
import { AppModule, Role } from "@/generated/prisma/enums";
import {
  archivarSchema,
  areaSchema,
  estadoMesaSchema,
  mesaSchema,
  mesasEnLoteSchema,
} from "@/features/salon/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";

/**
 * Administración del salón: áreas y mesas.
 *
 * El nombre de la mesa es único en TODO el negocio, no dentro del área: el mesero
 * canta "mesa 12" y tiene que haber una sola. Por eso el alta en lote lleva
 * prefijo y por eso archivar libera el nombre.
 */

const ADMINISTRAN = [Role.ADMINISTRADOR] as const;

export const guardarArea = defineAction({
  schema: areaSchema,
  roles: ADMINISTRAN,
  modulo: AppModule.MESAS,
  async handler({ input, ctx, db }) {
    const repetida = await db.area.findFirst({
      where: { name: input.name, ...(input.id ? { NOT: { id: input.id } } : {}) },
      select: { id: true },
    });
    if (repetida) throw new ErrorDeUsuario(`Ya existe un área "${input.name}".`);

    const area = input.id
      ? await db.area.update({
          where: { id: input.id },
          data: { name: input.name, sortOrder: input.sortOrder },
          select: { id: true },
        })
      : await db.area.create({
          data: { businessId: ctx.business.id, name: input.name, sortOrder: input.sortOrder },
          select: { id: true },
        });

    revalidatePath("/administracion/salon");
    revalidatePath("/salon");
    return area;
  },
});

export const archivarArea = defineAction({
  schema: archivarSchema,
  roles: ADMINISTRAN,
  modulo: AppModule.MESAS,
  async handler({ input, db }) {
    // Las mesas no se van con el área: quedan sin área y siguen apareciendo en el
    // salón bajo "Sin área". Perder mesas por borrar un área sería peor.
    await db.area.update({ where: { id: input.id }, data: { active: false } });
    await db.table.updateMany({ where: { areaId: input.id }, data: { areaId: null } });

    revalidatePath("/administracion/salon");
    revalidatePath("/salon");
  },
});

export const guardarMesa = defineAction({
  schema: mesaSchema,
  roles: ADMINISTRAN,
  modulo: AppModule.MESAS,
  async handler({ input, ctx, db }) {
    const repetida = await db.table.findFirst({
      where: {
        name: input.name,
        deletedAt: null,
        ...(input.id ? { NOT: { id: input.id } } : {}),
      },
      select: { id: true },
    });
    if (repetida) throw new ErrorDeUsuario(`Ya hay una mesa llamada "${input.name}".`);

    const mesa = input.id
      ? await db.table.update({
          where: { id: input.id },
          data: { name: input.name, capacity: input.capacity, areaId: input.areaId ?? null },
          select: { id: true },
        })
      : await db.table.create({
          data: {
            businessId: ctx.business.id,
            name: input.name,
            capacity: input.capacity,
            areaId: input.areaId ?? null,
          },
          select: { id: true },
        });

    revalidatePath("/administracion/salon");
    revalidatePath("/salon");
    return mesa;
  },
});

export const crearMesasEnLote = defineAction({
  schema: mesasEnLoteSchema,
  roles: ADMINISTRAN,
  modulo: AppModule.MESAS,
  async handler({ input, ctx, db }) {
    const prefijo = input.prefijo ?? "";
    const nombres = Array.from(
      { length: input.hasta - input.desde + 1 },
      (_, i) => `${prefijo}${input.desde + i}`,
    );

    // Se consulta primero cuáles ya existen para poder decir cuántas se saltaron,
    // en vez de fallar entera por una sola repetida.
    const existentes = await db.table.findMany({
      where: { name: { in: nombres }, deletedAt: null },
      select: { name: true },
    });
    const yaEstan = new Set(existentes.map((m) => m.name));
    const nuevas = nombres.filter((name) => !yaEstan.has(name));

    if (nuevas.length === 0) {
      throw new ErrorDeUsuario("Todas esas mesas ya existen.");
    }

    await db.table.createMany({
      data: nuevas.map((name, i) => ({
        businessId: ctx.business.id,
        name,
        areaId: input.areaId ?? null,
        capacity: input.capacity,
        sortOrder: input.desde + i,
      })),
    });

    revalidatePath("/administracion/salon");
    revalidatePath("/salon");
    return { creadas: nuevas.length, salteadas: yaEstan.size };
  },
});

export const cambiarEstadoMesa = defineAction({
  schema: estadoMesaSchema,
  roles: [Role.CAJERO, Role.ADMINISTRADOR],
  modulo: AppModule.MESAS,
  async handler({ input, db }) {
    const mesa = await db.table.findFirst({
      where: { id: input.id, deletedAt: null },
      select: { id: true, name: true, status: true },
    });
    if (!mesa) throw new ErrorDeUsuario("Esa mesa no existe.");

    if (mesa.status === "OCUPADA" || mesa.status === "CUENTA_PEDIDA") {
      throw new ErrorDeUsuario(
        `La mesa ${mesa.name} tiene un pedido abierto. Cerralo antes de cambiarle el estado.`,
      );
    }

    await db.table.update({ where: { id: mesa.id }, data: { status: input.status } });

    revalidatePath("/administracion/salon");
    revalidatePath("/salon");
  },
});

export const archivarMesa = defineAction({
  schema: archivarSchema,
  roles: ADMINISTRAN,
  modulo: AppModule.MESAS,
  async handler({ input, db }) {
    const mesa = await db.table.findFirst({
      where: { id: input.id, deletedAt: null },
      select: { id: true, name: true, status: true },
    });
    if (!mesa) throw new ErrorDeUsuario("Esa mesa no existe.");
    if (mesa.status === "OCUPADA" || mesa.status === "CUENTA_PEDIDA") {
      throw new ErrorDeUsuario(`La mesa ${mesa.name} tiene un pedido abierto.`);
    }

    // Se le cambia el nombre al archivarla para liberarlo: el índice único no
    // distingue archivadas, y la mesa 5 tiene que poder volver a existir.
    await db.table.update({
      where: { id: mesa.id },
      data: {
        deletedAt: new Date(),
        status: "INACTIVA",
        name: `${mesa.name} (archivada ${Date.now().toString(36)})`,
      },
    });

    revalidatePath("/administracion/salon");
    revalidatePath("/salon");
  },
});
