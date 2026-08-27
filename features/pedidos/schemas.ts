import { z } from "zod";
import { OrderType, PaymentMethod } from "@/generated/prisma/enums";
import { TIPOS_DE_DOCUMENTO } from "@/lib/billing/factus-habilitacion";
import {
  cantidad,
  casilla,
  correoOpcional,
  id,
  listaDeIds,
  montoCopPositivo,
  textoOpcional,
} from "@/lib/validaciones";

/**
 * Los datos que la DIAN exige para emitir la factura electrónica.
 *
 * Viajan con el cobro y no en una acción aparte: entre "guardé el cliente" y
 * "cobré" hay un hueco donde el pedido queda con datos fiscales y sin pago, o al
 * revés, y esa es exactamente la inconsistencia que después nadie sabe explicar.
 *
 * Solo se piden en los negocios que pueden facturar (`puedeFacturarElectronicamente`).
 * Sin marcar la casilla, la venta va a consumidor final y no se pide nada: es el
 * caso normal en un bar.
 */
export const camposFiscales = {
  facturaElectronica: casilla.default(false),
  docType: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.enum(TIPOS_DE_DOCUMENTO.map((t) => t.valor)).optional(),
  ),
  docNumber: textoOpcional(20),
  customerEmail: correoOpcional,
};

type FormaFiscal = {
  facturaElectronica: boolean;
  docType?: string;
  docNumber?: string;
  customerEmail?: string;
};

/**
 * Marcada la casilla, los tres campos pasan a ser obligatorios. Sin marcar, no se
 * mira ninguno: se factura a consumidor final.
 */
function exigirDatosFiscales<T extends FormaFiscal>(schema: z.ZodType<T>) {
  return schema
    .refine((v) => !v.facturaElectronica || Boolean(v.docType), {
      error: "Elegí el tipo de documento.",
      path: ["docType"],
    })
    .refine((v) => !v.facturaElectronica || Boolean(v.docNumber?.trim()), {
      error: "Escribí el número de documento.",
      path: ["docNumber"],
    })
    .refine((v) => !v.facturaElectronica || Boolean(v.customerEmail?.trim()), {
      error: "Escribí el correo al que se manda la factura.",
      path: ["customerEmail"],
    });
}

export const abrirPedidoSchema = z
  .object({
    type: z.enum(OrderType).default(OrderType.MESA),
    tableId: z.preprocess((v) => (v === "" ? undefined : v), id.optional()),
    guestsCount: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : Number(v)),
      z.number().int().min(1).max(99).optional(),
    ),
    customerName: textoOpcional(120),
    customerPhone: textoOpcional(40),
    deliveryAddress: textoOpcional(300),
    notes: textoOpcional(300),
  })
  .refine((v) => v.type !== OrderType.MESA || Boolean(v.tableId), {
    error: "Elegí una mesa.",
    path: ["tableId"],
  })
  .refine((v) => v.type !== OrderType.DOMICILIO || Boolean(v.deliveryAddress?.trim()), {
    error: "Ingresá la dirección de entrega para el domicilio.",
    path: ["deliveryAddress"],
  })
  .refine((v) => v.type !== OrderType.DOMICILIO || Boolean(v.customerPhone?.trim()), {
    error: "Ingresá el número celular de contacto para el domicilio.",
    path: ["customerPhone"],
  });

export const agregarItemSchema = z.object({
  orderId: id,
  productId: id,
  quantity: cantidad.default(1),
  notes: textoOpcional(200),
  /**
   * Las opciones elegidas en el modal. Llegan como campos repetidos del
   * formulario, por eso `listaDeIds` y no `z.array(id)`: con una sola opción
   * elegida el FormData entrega un string suelto.
   */
  modifierOptionIds: listaDeIds.default([]),
});

export const cambiarCantidadSchema = z.object({
  itemId: id,
  quantity: cantidad,
});

export const ponerNotaItemSchema = z.object({
  itemId: id,
  notes: textoOpcional(200),
});

export const quitarItemSchema = z.object({ itemId: id });

export const anularItemSchema = z.object({
  itemId: id,
  motivo: z
    .string()
    .trim()
    .min(3, "Escribí por qué se anula.")
    .max(200, "El motivo es demasiado largo."),
});

export const pedidoSchema = z.object({ orderId: id });

/**
 * Pedir la cuenta, con la propina que el cliente aceptó.
 *
 * La propina se decide ACÁ y no al cobrar: la pre-cuenta que la caja imprime
 * tiene que salir ya con la elección que el cliente le dio al mesero. Si se
 * eligiera recién en la caja, el papel que se lleva a la mesa mostraría un total
 * distinto al que se termina cobrando.
 */
export const pedirCuentaSchema = z.object({
  orderId: id,
  tipCop: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    montoCopPositivo.optional(),
  ),
});

/**
 * La etiqueta de la cuenta: "Andrés", "Camila". Es lo que distingue las cuentas
 * de una misma mesa en el salón, en la comanda de cocina y en el tiquete. No
 * tiene nada que ver con la facturación: a quién se factura se decide al cobrar.
 */
export const renombrarCuentaSchema = z.object({
  orderId: id,
  customerName: textoOpcional(120),
});

/** Cerrar la mesa entera cuando nadie pidió nada. */
export const liberarMesaSchema = z.object({ tableId: id });

export const anularPedidoSchema = z.object({
  orderId: id,
  motivo: z
    .string()
    .trim()
    .min(3, "Escribí por qué se anula.")
    .max(200, "El motivo es demasiado largo."),
});

export const propinaSchema = z.object({
  orderId: id,
  tipCop: montoCopPositivo,
});

export const pagoSchema = exigirDatosFiscales(
  z.object({
    orderId: id,
    method: z.enum(PaymentMethod),
    amountCop: montoCopPositivo.refine((v) => v > 0, "El pago tiene que ser mayor a cero."),
    /** Con cuánto pagó: solo aplica al efectivo y sirve para calcular el vuelto. */
    tenderedCop: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      montoCopPositivo.optional(),
    ),
    /**
     * La propina que el cliente aceptó, en pesos. Viaja CON el cobro y no en una
     * acción aparte por la misma razón que los datos fiscales: si no, existe el
     * estado intermedio "con propina y sin pago", y una propina cargada que
     * después no se cobra descuadra el total del pedido.
     *
     * Reemplaza la que tuviera el pedido: `0` es deseleccionarla.
     */
    tipCop: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      montoCopPositivo.optional(),
    ),
    reference: textoOpcional(60),
    ...camposFiscales,
  }),
);

const ventaPosCompleta = z
  .object({
    orderId: id.optional(),
    type: z.enum([OrderType.LLEVAR, OrderType.DOMICILIO]).default(OrderType.LLEVAR),
    customerName: z
      .string()
      .trim()
      .min(1, "El nombre del cliente es obligatorio para facturar e imprimir.")
      .max(120, "El nombre del cliente no puede superar 120 caracteres."),
    customerPhone: textoOpcional(40),
    deliveryAddress: textoOpcional(300),
    notes: textoOpcional(300),
    ...camposFiscales,
    items: z
      .array(
        z.object({
          productId: id,
          quantity: cantidad,
          notes: textoOpcional(200),
          modifierOptionIds: listaDeIds.default([]),
        }),
      )
      .default([]),
    /**
     * Qué se hace con el carrito.
     *
     * `ENVIAR_CAJA` es la puerta explícita: guarda el pedido, lo manda a cocina y
     * lo deja en `CUENTA_PEDIDA` para que la caja lo vea. Sin ella, un pedido del
     * POS no llega nunca a la caja —que es justamente el punto: mandar la comanda
     * a la plancha no es mandar la cuenta a cobrar—.
     */
    accion: z.enum(["PAGAR_DIRECTO", "ENVIAR_COCINA", "PARQUEAR", "ENVIAR_CAJA"]),
    /**
     * La propina elegida al mandar la cuenta a la caja.
     *
     * Va suelta y no dentro de `pago` porque en `ENVIAR_CAJA` no hay pago: es el
     * mismo momento que `pedirCuenta`, cuando se le pregunta al cliente. `0` es
     * válido y significa que la deseleccionaron.
     */
    tipCop: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : Number(v)),
      montoCopPositivo.optional(),
    ),
    pago: z
      .object({
        method: z.enum(PaymentMethod),
        amountCop: montoCopPositivo,
        tenderedCop: z.preprocess(
          (v) => (v === "" || v === undefined ? undefined : Number(v)),
          montoCopPositivo.optional(),
        ),
        /** La propina aceptada. Viaja con el cobro, no en una acción aparte. */
        tipCop: z.preprocess(
          (v) => (v === "" || v === undefined ? undefined : Number(v)),
          montoCopPositivo.optional(),
        ),
        reference: textoOpcional(60),
      })
      .optional(),
  })
  /**
   * Un pedido nuevo necesita al menos un producto; uno que se retoma, no.
   *
   * El carrito del POS solo trae lo que todavía no tomó la cocina, así que
   * reabrir un pedido que ya está en la plancha para mandarlo a caja o cobrarlo
   * llega con `items` vacío y `orderId` puesto. Que igual quede algo vivo lo
   * verifica el servidor contra la base, que es donde están los renglones.
   */
  .refine((v) => Boolean(v.orderId) || v.items.length > 0, {
    error: "Agregá al menos un producto al pedido.",
    path: ["items"],
  })
  .refine((v) => v.type !== OrderType.DOMICILIO || Boolean(v.deliveryAddress?.trim()), {
    error: "Ingresá la dirección de entrega para el domicilio.",
    path: ["deliveryAddress"],
  })
  .refine((v) => v.type !== OrderType.DOMICILIO || Boolean(v.customerPhone?.trim()), {
    error: "Ingresá el teléfono celular del cliente para el domicilio.",
    path: ["customerPhone"],
  });

export const procesarVentaPosCompletaSchema = exigirDatosFiscales(ventaPosCompleta);
