import { z } from "zod";
import { OrderType, PaymentMethod } from "@/generated/prisma/enums";
import { TIPOS_DE_DOCUMENTO } from "@/lib/billing/factus-habilitacion";
import { telefonoEsUsable } from "@/features/cartera/reglas";
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
/** Los tres campos del fiado: quién debe, cómo se le ubica y dónde vive. */
export const camposDeCredito = {
  creditoNombre: textoOpcional(120),
  creditoTelefono: textoOpcional(30),
  creditoDireccion: textoOpcional(200),
};

type FormaCredito = {
  method: string;
  creditoNombre?: string;
  creditoTelefono?: string;
};

/**
 * Fiar exige saber a quién.
 *
 * Solo cuando el método es CREDITO, y por la misma razón que los datos fiscales
 * se exigen solo al facturar: un campo obligatorio que no aplica bloquea el cobro
 * normal, que es el 99% de las veces. El teléfono es el único imprescindible —es
 * la identidad del deudor— y se valida su forma, no solo que esté: "no me acuerdo"
 * escrito en el campo crea un deudor que nunca se va a poder juntar con otro.
 */
function exigirDatosDeCredito<T extends FormaCredito>(schema: z.ZodType<T>) {
  return schema
    .refine((v) => v.method !== "CREDITO" || Boolean(v.creditoNombre?.trim()), {
      error: "Escribí a nombre de quién queda el fiado.",
      path: ["creditoNombre"],
    })
    .refine((v) => v.method !== "CREDITO" || telefonoEsUsable(v.creditoTelefono ?? ""), {
      error: "Escribí un teléfono válido: es lo que junta los pedidos de la misma persona.",
      path: ["creditoTelefono"],
    });
}

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
  /**
   * La clave de anulación, si el negocio configuró una.
   *
   * Opcional en el esquema y exigida en la acción, que es donde se sabe si hay
   * clave puesta: un `required` acá obligaría a mandar algo a los negocios que
   * no la usan, que son la mayoría.
   */
  clave: textoOpcional(100),
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

/**
 * Mudar una cuenta a otra mesa.
 *
 * El comensal se cambia de mesa y la cuenta se va con él. Hasta acá había que
 * cerrarla sin consumo y volver a tomar todo, o dejar que el sistema dijera una
 * mesa distinta de la que el mesero canta.
 */
export const trasladarPedidoSchema = z.object({
  orderId: id,
  tableIdDestino: id,
});

/**
 * Unir varias cuentas en una.
 *
 * `orderIds` son TODAS las que participan, `destinoOrderId` la que se queda con
 * los renglones —y tiene que ser una de ellas—. Se piden las dos cosas y no "las
 * otras más el destino" para que el servidor valide exactamente el conjunto que
 * la pantalla mostró.
 */
export const unirCuentasSchema = z.object({
  orderIds: z.preprocess(
    // Un formulario con casillas manda un solo valor cuando hay una marcada y un
    // arreglo cuando hay varias. Se deduplica acá: el mismo id repetido haría que
    // la consulta devolviera menos filas de las pedidas y el error hablara de una
    // cuenta que no existe, cuando el problema es otro.
    (v) => {
      const bruto = Array.isArray(v) ? v : v === undefined || v === "" ? [] : [v];
      return [...new Set(bruto)];
    },
    z.array(id).min(2, "Elegí al menos dos cuentas para unir.").max(20),
  ),
  destinoOrderId: id,
});

export const anularPedidoSchema = z.object({
  orderId: id,
  motivo: z
    .string()
    .trim()
    .min(3, "Escribí por qué se anula.")
    .max(200, "El motivo es demasiado largo."),
  /**
   * La clave de anulación, si el negocio configuró una.
   *
   * Opcional en el esquema y exigida en la acción, que es donde se sabe si hay
   * clave puesta: un `required` acá obligaría a mandar algo a los negocios que
   * no la usan, que son la mayoría.
   */
  clave: textoOpcional(100),
});

export const propinaSchema = z.object({
  orderId: id,
  tipCop: montoCopPositivo,
});

export const pagoSchema = exigirDatosDeCredito(
  exigirDatosFiscales(
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
    ...camposDeCredito,
  }),
  ),
);

const ventaPosCompleta = z
  .object({
    orderId: id.optional(),
    type: z.enum([OrderType.LLEVAR, OrderType.DOMICILIO]).default(OrderType.LLEVAR),
    /**
     * Opcional salvo en domicilio.
     *
     * Era obligatorio siempre, con el argumento de que es lo que se canta al
     * entregar. No lo es: **todo pedido sin mesa recibe `turnNumber`** al
     * crearse, y el turno es lo que se canta y lo que sale grande en la comanda.
     * Exigir además un nombre para una gaseosa de mostrador es una tecleada por
     * venta en la pantalla que más ventas por minuto hace del producto.
     *
     * En domicilio sí, y por una razón distinta: ahí no hay turno que cantar
     * sino un paquete que alguien tiene que recibir en una puerta. Va junto a la
     * dirección y el celular, que ya se exigen abajo por lo mismo.
     */
    customerName: textoOpcional(120),
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
     * Existía además `ENVIAR_CAJA`, la puerta explícita del POS. **Se fue**:
     * desde que la caja lista toda comanda que salió a cocina, mandarla era un
     * trámite que le escondía al cajero la mitad de su trabajo hasta que alguien
     * se acordara de tocar el botón.
     */
    accion: z.enum(["PAGAR_DIRECTO", "ENVIAR_COCINA", "PARQUEAR"]),
    /**
     * La propina elegida al mandar la cuenta a la caja.
     *
     * Queda para el pago directo, que la manda dentro de `pago`. `0` es válido y
     * significa que la deseleccionaron.
     */
    tipCop: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : Number(v)),
      montoCopPositivo.optional(),
    ),
    /**
     * El cobro directo desde el mostrador.
     *
     * Lleva los tres campos del fiado por lo mismo que los lleva `pagoSchema`:
     * el POS acepta `CREDITO` desde que `method` es el enum completo, y sin
     * ellos un fiado cobrado por acá creaba el `OrderPayment` sin su `Fiado`.
     * O sea una venta cerrada, plata que no entró, y una deuda que no figura en
     * Cartera y que nadie va a cobrar nunca. La validación va abajo, con el
     * mismo `refine` que usa la caja.
     */
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
        ...camposDeCredito,
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
  .refine((v) => v.type !== OrderType.DOMICILIO || Boolean(v.customerName?.trim()), {
    error: "En un domicilio hace falta a nombre de quién va el pedido.",
    path: ["customerName"],
  })
  .refine((v) => v.type !== OrderType.DOMICILIO || Boolean(v.customerPhone?.trim()), {
    error: "Ingresá el teléfono celular del cliente para el domicilio.",
    path: ["customerPhone"],
  })
  /**
   * El fiado exige lo mismo que en la caja, con los campos un nivel más adentro.
   *
   * No se puede reusar `exigirDatosDeCredito` porque aquel los espera en la
   * raíz y acá viajan dentro de `pago`. Lo que NO puede pasar es que el POS sea
   * más flojo: un fiado sin teléfono no se puede juntar con los otros pedidos de
   * la misma persona, y sin nombre no hay a quién cobrarle.
   */
  .refine((v) => v.pago?.method !== "CREDITO" || Boolean(v.pago?.creditoNombre?.trim()), {
    error: "Escribí a nombre de quién queda el fiado.",
    path: ["pago", "creditoNombre"],
  })
  .refine(
    (v) => v.pago?.method !== "CREDITO" || telefonoEsUsable(v.pago?.creditoTelefono ?? ""),
    {
      error: "Escribí un teléfono válido: es lo que junta los pedidos de la misma persona.",
      path: ["pago", "creditoTelefono"],
    },
  );

export const procesarVentaPosCompletaSchema = exigirDatosFiscales(ventaPosCompleta);

/** La clave de anulación: la pone y la cambia solo el propietario. */
export const claveAnulacionSchema = z
  .object({
    claveActual: textoOpcional(72),
    clave: z
      .string()
      .trim()
      .min(6, "La clave tiene que tener al menos 6 caracteres.")
      .max(72, "La clave es demasiado larga."),
    claveRepetida: z.string().trim().min(1, "Repetí la clave."),
  })
  .refine((v) => v.clave === v.claveRepetida, {
    error: "Las dos claves no coinciden.",
    path: ["claveRepetida"],
  });

export const quitarClaveAnulacionSchema = z.object({
  claveActual: z.string().trim().min(1, "Escribí la clave actual."),
});
