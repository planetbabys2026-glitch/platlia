import "server-only";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { normalizarTelefono } from "@/features/cartera/reglas";
import { ErrorDeUsuario } from "@/lib/actions/estado";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Deja anotado un fiado. Se llama DENTRO de la transacción que cierra el pedido.
 *
 * Vive suelto y no en `features/cartera/actions.ts` porque lo usan los dos únicos
 * lugares que cobran —`registrarPago` y `procesarVentaPosCompleta`—, y si cada uno
 * escribiera lo suyo, un fiado del mostrador y uno de una mesa terminarían siendo
 * dos cosas distintas en la base.
 *
 * Va adentro de la transacción a propósito: un `Fiado` sin su `OrderPayment` es
 * una deuda que nadie generó, y un `OrderPayment` de crédito sin `Fiado` es plata
 * que no entró y que además nadie debe. Las dos filas nacen juntas o no nace
 * ninguna.
 */
type Transaccion = Omit<TenantDb, "$transaction" | "$connect" | "$disconnect" | "$extends">;

export type DatosDelFiado = {
  nombre: string;
  telefono: string;
  direccion?: string | null;
};

export async function anotarFiado(
  tx: Transaccion,
  args: {
    businessId: string;
    orderId: string;
    orderPaymentId: string;
    montoCop: number;
    datos: DatosDelFiado;
    creadoPorId: string;
    cashSessionId: string | null;
  },
): Promise<{ deudorId: string; fiadoId: string; saldoPrevioCop: number }> {
  const telefono = normalizarTelefono(args.datos.telefono);
  if (telefono.length < 7) {
    throw new ErrorDeUsuario("El teléfono del fiado no es válido.");
  }

  /**
   * El deudor se busca por teléfono y se ACTUALIZA con lo que se escribió ahora.
   *
   * Si la persona corrigió su nombre o se mudó, lo último que dijo es lo que vale:
   * la alternativa —conservar el primer nombre que alguien tecleó— deja fichas con
   * datos viejos que nadie puede corregir sin entrar a la base.
   */
  const deudor = await tx.deudor.upsert({
    where: { businessId_telefono: { businessId: args.businessId, telefono } },
    create: {
      businessId: args.businessId,
      telefono,
      nombre: args.datos.nombre.trim(),
      direccion: args.datos.direccion?.trim() || null,
    },
    update: {
      nombre: args.datos.nombre.trim(),
      ...(args.datos.direccion?.trim() ? { direccion: args.datos.direccion.trim() } : {}),
      // Un deudor archivado que vuelve a fiar vuelve a estar vivo.
      deletedAt: null,
    },
    select: { id: true },
  });

  // Cuánto debía ANTES de este pedido: es lo que la pantalla informa al confirmar
  // ("ya debía $45.000"), y lo que hace que el dato no haya que ir a buscarlo.
  const previo = await tx.fiado.aggregate({
    where: { deudorId: deudor.id, saldoCop: { gt: 0 } },
    _sum: { saldoCop: true },
  });

  const fiado = await tx.fiado.create({
    data: {
      businessId: args.businessId,
      deudorId: deudor.id,
      orderId: args.orderId,
      orderPaymentId: args.orderPaymentId,
      montoCop: args.montoCop,
      saldoCop: args.montoCop,
      creadoPorId: args.creadoPorId,
      cashSessionId: args.cashSessionId,
    },
    select: { id: true },
  });

  return {
    deudorId: deudor.id,
    fiadoId: fiado.id,
    saldoPrevioCop: previo._sum.saldoCop ?? 0,
  };
}

/** Si este método de pago deja una deuda en vez de plata. */
export function esFiado(method: PaymentMethod | string): boolean {
  return method === "CREDITO";
}
