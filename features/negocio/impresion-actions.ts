"use server";

import { revalidatePath } from "next/cache";
import { PrinterRole, Role } from "@/generated/prisma/enums";
import {
  agenteImpresionSchema,
  borrarImpresoraSchema,
  comandaDestinoSchema,
  impresoraSchema,
  pruebaDeImpresionSchema,
  regenerarTokenSchema,
  rutasDeImpresionSchema,
} from "@/features/negocio/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import {
  archivoDeConfiguracion,
  emitirToken,
  regenerarCodigo,
  registrarEquipo,
} from "@/lib/printing/agente";
import { avisarAlAgente, encolarImpresion } from "@/lib/printing/cola";
import { env } from "@/lib/env";

/**
 * Configuración de la impresión térmica.
 *
 * Vive aparte de `features/negocio/actions.ts` porque ese archivo ya tiene once
 * acciones y esto es un tema entero: impresoras, rutas por estación, el token del
 * agente y la página de prueba.
 *
 * Solo el administrador: una impresora mal apuntada manda las comandas al cuarto
 * equivocado, y el token es la llave de la cola de impresión del local.
 */
const ADMINISTRAN = [Role.ADMINISTRADOR] as const;

export const guardarImpresora = defineAction({
  schema: impresoraSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    const datos = {
      name: input.name,
      rol: input.rol as PrinterRole,
      host: input.host,
      port: input.port,
      width: input.width,
      // El pulso del cajón solo tiene sentido donde está la plata.
      abreCajon: input.rol === "RECIBO" ? input.abreCajon : false,
      active: input.active,
    };

    if (input.id) {
      const existente = await db.printer.findFirst({
        where: { id: input.id },
        select: { id: true },
      });
      if (!existente) throw new ErrorDeUsuario("Esa impresora ya no existe.");
      await db.printer.update({ where: { id: existente.id }, data: datos });
    } else {
      const repetida = await db.printer.findFirst({
        where: { name: input.name },
        select: { id: true },
      });
      if (repetida) throw new ErrorDeUsuario(`Ya hay una impresora que se llama "${input.name}".`);
      await db.printer.create({ data: { businessId: ctx.business.id, ...datos } });
    }

    revalidatePath("/administracion/configuracion");
  },
});

export const borrarImpresora = defineAction({
  schema: borrarImpresoraSchema,
  roles: ADMINISTRAN,
  async handler({ input, db }) {
    const pendientes = await db.printJob.count({
      where: { printerId: input.id, estado: { in: ["PENDIENTE", "RECLAMADO"] } },
    });
    if (pendientes > 0) {
      throw new ErrorDeUsuario(
        `Esa impresora tiene ${pendientes} trabajo(s) sin imprimir. Apagala en vez de borrarla, o esperá a que salgan.`,
      );
    }

    await db.printer.delete({ where: { id: input.id } });
    revalidatePath("/administracion/configuracion");
  },
});

/**
 * El mapa de estación a impresora.
 *
 * Se borra y se reescribe entero, como los tramos de precios: son cuatro o cinco
 * filas que se tocan una vez, y así no puede quedar a medio aplicar.
 */
export const guardarRutasDeImpresion = defineAction({
  schema: rutasDeImpresionSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    const impresoras = await db.printer.findMany({ select: { id: true } });
    const validas = new Set(impresoras.map((i) => i.id));

    await db.$transaction(async (tx) => {
      await tx.printRoute.deleteMany({});
      for (const ruta of input.rutas) {
        if (!validas.has(ruta.printerId)) continue;
        await tx.printRoute.create({
          data: {
            businessId: ctx.business.id,
            stationName: ruta.stationName,
            printerId: ruta.printerId,
          },
        });
      }
    });

    revalidatePath("/administracion/configuracion");
  },
});

export const guardarComandaDestino = defineAction({
  schema: comandaDestinoSchema,
  roles: ADMINISTRAN,
  async handler({ input, db }) {
    await db.businessSettings.updateMany({
      data: { comandaDestino: input.comandaDestino },
    });
    revalidatePath("/administracion/configuracion");
    revalidatePath("/cocina");
  },
});

/**
 * Da de alta el equipo del local y devuelve su código de emparejamiento.
 *
 * **No devuelve un token.** El token nace cuando el programa canjea el código, así
 * que entre el alta y la primera ejecución no hay ningún secreto de larga vida
 * dando vueltas por un chat. Y nadie tiene que copiar 43 caracteres: el código
 * viaja en el nombre del archivo que se descarga.
 */
export const crearAgenteDeImpresion = defineAction({
  schema: agenteImpresionSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx }) {
    const agente = await registrarEquipo(ctx.business.id, input.nombre);
    revalidatePath("/administracion/configuracion");
    return { codigo: agente.codigo, id: agente.id };
  },
});

/** Un código nuevo: se venció, se perdió el archivo, o se cambia de computadora. */
export const regenerarTokenDeAgente = defineAction({
  schema: regenerarTokenSchema,
  roles: ADMINISTRAN,
  async handler({ input, db }) {
    const agente = await db.printAgent.findFirst({
      where: { id: input.id },
      select: { id: true },
    });
    if (!agente) throw new ErrorDeUsuario("Ese equipo ya no está registrado.");

    const codigo = await regenerarCodigo(agente.id);
    revalidatePath("/administracion/configuracion");
    return { codigo, id: agente.id };
  },
});

/**
 * El `agente.json` para configurar el equipo a mano.
 *
 * El camino del código de emparejamiento supone que el programa se baja desde
 * esta pantalla, porque el código viaja en el nombre del archivo. Cuando lo
 * instala nuestro propio equipo —que llega al local con el ejecutable ya
 * compilado— ese camino no aplica: el servidor no necesita repartir binarios y
 * lo único que falta es el archivo de configuración.
 *
 * Emitir el token **quema el código**: quien ya se bajó el programa con el
 * código adentro deja de poder emparejarse, así que la pantalla lo dice antes.
 */
export const emitirConfiguracionDeAgente = defineAction({
  schema: regenerarTokenSchema,
  roles: ADMINISTRAN,
  async handler({ input, db }) {
    const agente = await db.printAgent.findFirst({
      where: { id: input.id },
      select: { id: true, nombre: true },
    });
    if (!agente) throw new ErrorDeUsuario("Ese equipo ya no está registrado.");

    const token = await emitirToken(agente.id);

    revalidatePath("/administracion/configuracion");
    return {
      nombre: agente.nombre,
      archivo: archivoDeConfiguracion({ url: env.APP_URL, token, nombre: agente.nombre }),
    };
  },
});

export const borrarAgenteDeImpresion = defineAction({
  schema: regenerarTokenSchema,
  roles: ADMINISTRAN,
  async handler({ input, db }) {
    await db.printAgent.deleteMany({ where: { id: input.id } });
    revalidatePath("/administracion/configuracion");
  },
});

/**
 * Manda una página de prueba.
 *
 * Es lo que convierte "configuré la impresora" en "la impresora funciona". Sin
 * esto, la primera vez que alguien se entera de que la IP está mal es con un
 * cliente esperando el recibo.
 */
export const imprimirPrueba = defineAction({
  schema: pruebaDeImpresionSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    const impresora = await db.printer.findFirst({
      where: { id: input.printerId },
      select: { id: true, name: true, width: true, abreCajon: true, active: true },
    });
    if (!impresora) throw new ErrorDeUsuario("Esa impresora ya no existe.");
    if (!impresora.active) throw new ErrorDeUsuario("Esa impresora está apagada.");

    const ancho = impresora.width === "MM55" ? 32 : 48;
    await encolarImpresion(db, ctx.business.id, {
      printerId: impresora.id,
      tipo: "PRUEBA",
      lineas: [
        "PRUEBA DE IMPRESION",
        "=".repeat(ancho),
        `Impresora: ${impresora.name}`,
        `Ancho: ${ancho} caracteres`,
        // Con acentos a propósito: es el error más común y solo se ve en papel.
        "Acentos: ñ Ñ á é í ó ú ü ¿ ¡",
        "=".repeat(ancho),
        "Si leés esto, quedó lista.",
      ],
      lineasDestacadas: 1,
      abrirCajon: impresora.abreCajon,
    });

    avisarAlAgente(ctx.business.id);
    revalidatePath("/administracion/configuracion");
    return { ok: true };
  },
});
