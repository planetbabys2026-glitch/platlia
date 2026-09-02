"use server";

import { revalidatePath } from "next/cache";
import { AppModule, Role } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import {
  buscarDocumentoPorReferencia,
  construirPayloadFactus,
  construirPayloadNotaCredito,
  type DatosFacturaPlatlia,
  type DatosNotaCreditoPlatlia,
  enviarFacturaAFactus,
  enviarNotaCreditoAFactus,
  identificadorDian,
  obtenerTokenFactus,
  type PedidoParaFacturar,
  type RespuestaFactusValidacion,
  type TipoDeDocumentoFactus,
} from "@/lib/billing/factus";
import {
  faltantesParaFacturar,
  puedeFacturarElectronicamente,
} from "@/lib/billing/factus-habilitacion";
import {
  configFactusDePlataforma,
  plataformaFacturaConfigurada,
} from "@/lib/billing/factus-plataforma";
import { tenantDb } from "@/lib/db/tenant";
import { emitirFacturaSchema, emitirNotaCreditoSchema } from "./schemas";

/**
 * Emitir la factura electrónica ante la DIAN, a través de Factus.
 *
 * Esto no existía: el chulo de "factura electrónica" del cobro solo guardaba el
 * documento y el correo del cliente en el pedido, y el cliente HTTP de
 * `lib/billing/factus.ts` no lo llamaba nadie fuera de sus propios tests. Un
 * negocio con el módulo pagado y prendido no emitía absolutamente nada.
 *
 * Tres cosas que gobiernan este archivo:
 *
 *  1. **La llamada a Factus va FUERA de toda transacción.** Una transacción
 *     abierta contra la red es un lock de base esperando a un tercero, y Factus
 *     habla con la DIAN: puede tardar segundos.
 *  2. **La venta se reclama antes de salir.** Dos clics en el botón son dos
 *     facturas ante la DIAN, que es un problema fiscal y no un duplicado
 *     cosmético. La reclama un `updateMany` condicionado, y como segunda red el
 *     `reference_code` es determinista: si igual salieran dos, Factus rechaza la
 *     segunda por repetida.
 *  3. **El paquete se descuenta cuando el documento existe**, no antes.
 */

/** Cuánto vale un reclamo de emisión antes de poder reintentar. */
const RECLAMO_VENCE_MS = 2 * 60 * 1000;

/** Lo que se le pide al pedido para poder facturarlo. */
const SELECCION_PEDIDO = {
  id: true,
  code: true,
  status: true,
  notes: true,
  totalCop: true,
  tipCop: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  deliveryAddress: true,
  docType: true,
  docNumber: true,
  facturaElectronicaNumero: true,
  facturaElectronicaCufe: true,
  facturaElectronicaEstado: true,
  facturaElectronicaFecha: true,
  notaCreditoCufe: true,
  items: {
    where: { status: { not: "ANULADO" as const } },
    select: {
      id: true,
      productId: true,
      nameSnapshot: true,
      quantity: true,
      lineSubtotalCop: true,
      taxRateBpSnapshot: true,
      taxKindSnapshot: true,
    },
  },
  payments: {
    where: { voidedAt: null },
    select: { id: true, method: true, amountCop: true },
  },
} as const;

type PedidoLeido = {
  id: string;
  code: number;
  notes: string | null;
  totalCop: number;
  tipCop: number;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  deliveryAddress: string | null;
  docType: string | null;
  docNumber: string | null;
  items: PedidoParaFacturar["items"];
  payments: PedidoParaFacturar["payments"];
};

function comoPedidoParaFacturar(pedido: PedidoLeido): PedidoParaFacturar {
  return {
    id: pedido.id,
    code: pedido.code,
    notes: pedido.notes,
    totalCop: pedido.totalCop,
    tipCop: pedido.tipCop,
    customerName: pedido.customerName,
    customerPhone: pedido.customerPhone,
    customerEmail: pedido.customerEmail,
    deliveryAddress: pedido.deliveryAddress,
    docType: pedido.docType,
    docNumber: pedido.docNumber,
    items: pedido.items,
    payments: pedido.payments,
  };
}

/**
 * Un error de Factus, recortado para que quepa en un mensaje.
 *
 * El detalle sí se muestra: sin él ("el rango de numeración no existe", "el NIT
 * no está registrado") no hay forma de saber qué corregir, y quien lo lee es el
 * dueño o el cajero de ese negocio, no un desconocido.
 */
function detalleDe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "sin detalle";
}

type Emitido = NonNullable<RespuestaFactusValidacion["data"]>;

/**
 * Emite y, si algo falla, va a ver si el documento igual quedó creado.
 *
 * Sin esa segunda vuelta, una respuesta perdida deja un documento vivo ante la
 * DIAN que el sistema no registró, y el reintento choca contra el
 * `reference_code` repetido para siempre. Como la referencia es determinista, se
 * puede recuperar.
 */
async function emitirYRecuperar(
  tipo: TipoDeDocumentoFactus,
  referencia: string,
  enviar: (token: string, baseUrl: string) => Promise<RespuestaFactusValidacion>,
): Promise<Emitido> {
  const config = configFactusDePlataforma();
  const { access_token } = await obtenerTokenFactus(config);

  let respuesta: RespuestaFactusValidacion | null = null;
  let fallo: unknown = null;
  try {
    respuesta = await enviar(access_token, config.baseUrl);
  } catch (error) {
    fallo = error;
  }

  if (respuesta && identificadorDian(respuesta.data)) return respuesta.data as Emitido;

  const existente = await buscarDocumentoPorReferencia(
    access_token,
    config.baseUrl,
    tipo,
    referencia,
  );
  if (existente && identificadorDian(existente)) return existente;

  if (fallo) throw fallo;
  throw new Error(respuesta?.message ?? "Factus no devolvió el identificador del documento.");
}

async function emitirFactura(datos: DatosFacturaPlatlia): Promise<Emitido> {
  const payload = construirPayloadFactus(datos);
  return emitirYRecuperar("bills", payload.reference_code, (token, baseUrl) =>
    enviarFacturaAFactus(token, payload, baseUrl),
  );
}

async function emitirNota(datos: DatosNotaCreditoPlatlia): Promise<Emitido> {
  const payload = construirPayloadNotaCredito(datos);
  return emitirYRecuperar("credit-notes", payload.reference_code, (token, baseUrl) =>
    enviarNotaCreditoAFactus(token, payload, baseUrl),
  );
}

export const emitirFacturaElectronica = defineAction({
  schema: emitirFacturaSchema,
  roles: [Role.PROPIETARIO, Role.ADMINISTRADOR, Role.CAJERO],
  modulo: AppModule.CAJA,
  async handler({ input, ctx }) {
    const settings = await getSettings(ctx.business.id);
    const faltantes = faltantesParaFacturar(settings, plataformaFacturaConfigurada());
    if (faltantes.length > 0) {
      throw new ErrorDeUsuario(`No se puede facturar todavía: ${faltantes.join(" ")}`);
    }

    const db = tenantDb(ctx.business.id);
    const pedido = await db.order.findFirst({
      where: { id: input.orderId },
      select: SELECCION_PEDIDO,
    });
    if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");

    if (pedido.status !== "PAGADA") {
      throw new ErrorDeUsuario("Solo se factura una venta ya cobrada.");
    }
    if (pedido.facturaElectronicaCufe) {
      throw new ErrorDeUsuario("Esta venta ya tiene factura electrónica.");
    }
    if (pedido.items.length === 0) {
      throw new ErrorDeUsuario("El pedido no tiene renglones para facturar.");
    }

    /**
     * Los datos corregidos se guardan ANTES de armar el documento.
     *
     * Corregir y emitir son un solo acto: si se guardaran en una acción aparte,
     * existiría el estado "datos cambiados, factura sin emitir" y nadie sabría
     * después si el documento salió con los viejos o con los nuevos. Y va antes
     * del reclamo de abajo porque el payload se construye leyendo el pedido: si
     * se escribieran después, la factura saldría con lo anterior.
     *
     * Solo se escribe lo que vino: un campo vacío no borra lo que ya estaba, que
     * es lo que pasaría al reintentar una emisión fallida sin volver a teclear
     * todo.
     */
    const correcciones = {
      ...(input.customerName?.trim() ? { customerName: input.customerName.trim() } : {}),
      ...(input.docType ? { docType: input.docType } : {}),
      ...(input.docNumber?.trim() ? { docNumber: input.docNumber.trim() } : {}),
      ...(input.customerEmail?.trim() ? { customerEmail: input.customerEmail.trim() } : {}),
    };

    if (Object.keys(correcciones).length > 0) {
      await db.order.update({ where: { id: pedido.id }, data: correcciones });
      Object.assign(pedido, correcciones);

      await db.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: "dian.corregir-datos",
          entity: "Order",
          entityId: pedido.id,
          metadata: correcciones,
        },
      });
    }

    /**
     * Se reclama la venta antes de salir a la red: dos clics seguidos en el botón
     * serían dos facturas ante la DIAN.
     *
     * El `OR` con `estado: null` no es adorno. `NOT (estado = 'EMITIENDO')` en SQL
     * da NULL —no `true`— cuando la columna es nula, así que la condición
     * "cualquier cosa menos EMITIENDO" excluía justamente el caso normal: la
     * primera factura de cada venta se rechazaba a sí misma.
     *
     * La reclama caduca: si el proceso se muere entre el reclamo y la respuesta,
     * la venta quedaría bloqueada para siempre. Pasados dos minutos se puede
     * volver a intentar, y el `reference_code` determinista impide que un reintento
     * cree un documento nuevo.
     */
    const reclamoVencido = new Date(Date.now() - RECLAMO_VENCE_MS);
    const reclamo = await db.order.updateMany({
      where: {
        id: pedido.id,
        facturaElectronicaCufe: null,
        OR: [
          { facturaElectronicaEstado: null },
          { facturaElectronicaEstado: { not: "EMITIENDO" } },
          { facturaElectronicaFecha: { lt: reclamoVencido } },
        ],
      },
      data: {
        facturaElectronicaEstado: "EMITIENDO",
        facturaElectronicaFecha: new Date(),
        facturaElectronicaError: null,
      },
    });
    if (reclamo.count === 0) {
      throw new ErrorDeUsuario("Esta venta ya se está facturando. Esperá unos segundos.");
    }

    const negocio = await db.business.findFirstOrThrow({
      select: { name: true, address: true, phone: true },
    });

    let datos: Emitido;
    try {
      datos = await emitirFactura({
        order: comoPedidoParaFacturar(pedido),
        business: negocio,
        fiscal: {
          numberingRangeId: settings.factusNumberingRangeId,
          municipalityCode: settings.municipalityCode,
        },
      });
    } catch (error) {
      await db.order.updateMany({
        where: { id: pedido.id },
        data: {
          facturaElectronicaEstado: "ERROR",
          facturaElectronicaError: detalleDe(error),
        },
      });
      throw new ErrorDeUsuario(`Factus rechazó la factura. ${detalleDe(error)}`);
    }

    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: pedido.id },
        data: {
          facturaElectronicaNumero: datos.number ?? null,
          facturaElectronicaCufe: identificadorDian(datos)!,
          facturaElectronicaUrlPdf: datos.links?.public_url ?? null,
          facturaElectronicaUrlQr: datos.links?.qr ?? null,
          facturaElectronicaEstado: "EMITIDA",
          facturaElectronicaFecha: new Date(),
          facturaElectronicaError: null,
        },
      });

      // El documento se descuenta del paquete recién acá, con el CUFE en la mano.
      // Es el contador que `documentosRestantes` lee y que nunca se incrementaba.
      await tx.businessSettings.updateMany({
        where: { businessId: ctx.business.id },
        data: { documentosEmitidosConsumidos: { increment: 1 } },
      });
    });

    revalidatePath("/caja");
    revalidatePath(`/pedido/${pedido.id}`);

    return {
      numero: datos.number ?? null,
      cufe: identificadorDian(datos),
      urlPdf: datos.links?.public_url ?? null,
      // La DIAN manda notificaciones (FAJ44b, RUT01) que NO implican rechazo: lo
      // que decide es `is_validated`, así que un `errors` con contenido no puede
      // tratarse como falla.
      validada: datos.is_validated !== false,
    };
  },
});

/**
 * Nota crédito: la forma de deshacer una factura ya emitida.
 *
 * Una factura electrónica no se borra. Sin esto, anular una venta facturada la
 * dejaba viva ante la DIAN: plata declarada que no se vendió.
 */
export const emitirNotaCredito = defineAction({
  schema: emitirNotaCreditoSchema,
  roles: [Role.PROPIETARIO, Role.ADMINISTRADOR],
  modulo: AppModule.CAJA,
  async handler({ input, ctx }) {
    const settings = await getSettings(ctx.business.id);
    if (!puedeFacturarElectronicamente(settings, plataformaFacturaConfigurada())) {
      throw new ErrorDeUsuario(
        "No se puede emitir la nota crédito: revisá la configuración de facturación.",
      );
    }

    const db = tenantDb(ctx.business.id);
    const pedido = await db.order.findFirst({
      where: { id: input.orderId },
      select: SELECCION_PEDIDO,
    });
    if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");

    if (!pedido.facturaElectronicaCufe || !pedido.facturaElectronicaNumero) {
      throw new ErrorDeUsuario("Esta venta no tiene factura electrónica que anular.");
    }
    if (pedido.notaCreditoCufe) {
      throw new ErrorDeUsuario("Esta factura ya tiene su nota crédito.");
    }
    if (!settings.factusNumberingRangeIdNc) {
      throw new ErrorDeUsuario(
        "Falta asignarle a este negocio el rango de numeración de notas crédito.",
      );
    }

    const negocio = await db.business.findFirstOrThrow({
      select: { name: true, address: true, phone: true },
    });

    let datos: Emitido;
    try {
      datos = await emitirNota({
        // El motivo va como observación del documento: es lo que después explica
        // por qué se anuló.
        order: { ...comoPedidoParaFacturar(pedido), notes: input.motivo },
        business: negocio,
        fiscal: {
          numberingRangeId: settings.factusNumberingRangeId,
          numberingRangeIdNotaCredito: settings.factusNumberingRangeIdNc,
          municipalityCode: settings.municipalityCode,
        },
        facturaNumero: pedido.facturaElectronicaNumero,
      });
    } catch (error) {
      await db.order.updateMany({
        where: { id: pedido.id },
        data: { notaCreditoError: detalleDe(error) },
      });
      throw new ErrorDeUsuario(`Factus rechazó la nota crédito. ${detalleDe(error)}`);
    }

    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: pedido.id },
        data: {
          notaCreditoNumero: datos.number ?? null,
          // Una nota crédito trae CUDE, no CUFE: leer solo `cufe` guardaba como
          // error una nota que la DIAN sí había validado.
          notaCreditoCufe: identificadorDian(datos)!,
          notaCreditoUrlPdf: datos.links?.public_url ?? null,
          notaCreditoFecha: new Date(),
          notaCreditoError: null,
        },
      });
      // Una nota crédito también es un documento electrónico y consume paquete.
      await tx.businessSettings.updateMany({
        where: { businessId: ctx.business.id },
        data: { documentosEmitidosConsumidos: { increment: 1 } },
      });
    });

    revalidatePath("/caja");
    revalidatePath(`/pedido/${pedido.id}`);

    return { numero: datos.number ?? null, cude: identificadorDian(datos) };
  },
});
