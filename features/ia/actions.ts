"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@/generated/prisma/enums";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { generarToken, hashDeToken } from "@/lib/mcp/token";
import { crearTokenIaSchema, revocarTokenIaSchema } from "./schemas";

/**
 * Las conexiones de IA de un negocio.
 *
 * **Solo el propietario.** No es una preferencia de pantalla: quien crea una de
 * estas llaves está autorizando a un servicio de un tercero a leer las ventas, los
 * costos y los márgenes del negocio entero. Un administrador puede configurar
 * impresoras y permisos; sacar la contabilidad para afuera es del dueño.
 */

const MAXIMO_CONEXIONES = 5;

export const crearTokenIa = defineAction({
  schema: crearTokenIaSchema,
  roles: [Role.PROPIETARIO],
  async handler({ input, ctx, db }) {
    const cuantas = await db.tokenIa.count();
    if (cuantas >= MAXIMO_CONEXIONES) {
      // Un tope bajo a propósito: cada llave viva es una copia más de la
      // información afuera, y nadie necesita quince. Si sobran, se revocan.
      throw new ErrorDeUsuario(
        `Ya tenés ${MAXIMO_CONEXIONES} conexiones. Revocá alguna que no uses antes de crear otra.`,
      );
    }

    const crudo = generarToken();

    await db.tokenIa.create({
      data: {
        // `tenantDb` lo pisa con el mismo valor, pero la columna es obligatoria y
        // el tipo lo exige: es la red que hace que un olvido reviente al compilar
        // en vez de escribir en la empresa equivocada.
        businessId: ctx.business.id,
        nombre: input.nombre,
        tokenHash: hashDeToken(crudo),
        createdById: ctx.user.id,
      },
    });

    await db.auditLog.create({
      data: {
        businessId: ctx.business.id,
        userId: ctx.user.id,
        action: "ia.conexion.crear",
        entity: "TokenIa",
        metadata: { nombre: input.nombre },
      },
    });

    revalidatePath("/administracion/configuracion");

    /**
     * El token se devuelve UNA sola vez.
     *
     * De acá en adelante solo existe su hash, así que ni nosotros podemos
     * volver a mostrarlo. Es lo que hace que una copia de la base no sirva para
     * leerle las ventas a nadie, y por eso la pantalla insiste en copiarlo antes
     * de cerrar.
     */
    return { token: crudo };
  },
});

export const revocarTokenIa = defineAction({
  schema: revocarTokenIaSchema,
  roles: [Role.PROPIETARIO],
  async handler({ input, ctx, db }) {
    // `deleteMany` y no `delete`: `tenantDb` le agrega el `businessId` al where,
    // así que el id de otra empresa no borra nada en vez de borrar lo ajeno.
    const { count } = await db.tokenIa.deleteMany({ where: { id: input.tokenId } });
    if (count === 0) throw new ErrorDeUsuario("Esa conexión ya no existe.");

    await db.auditLog.create({
      data: {
        businessId: ctx.business.id,
        userId: ctx.user.id,
        action: "ia.conexion.revocar",
        entity: "TokenIa",
        entityId: input.tokenId,
      },
    });

    revalidatePath("/administracion/configuracion");
    return { revocado: true };
  },
});
