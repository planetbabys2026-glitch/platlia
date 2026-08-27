import { z } from "zod";
import { montoCopPositivo, textoOpcional } from "@/lib/validaciones";

/**
 * El insumo se mide en unidades y en nada más.
 *
 * Antes había que elegir entre gramo, kilo, mililitro, litro y paquete, y esa
 * elección no la usaba nadie: el sistema no convierte —una receta que pide 1
 * "kilogramo" descuenta 1 del stock, no 1000 gramos—, así que la unidad era una
 * etiqueta que solo servía para escribirla en pantalla. Peor: invitaba a cargar
 * un insumo en kilos y pedirlo en gramos en la receta, y ahí el descuento queda
 * mil veces mal sin que nada falle.
 *
 * Ahora todo es "unidad" y a cuánto equivale una lo decide quien la carga, en el
 * nombre del insumo: "Carne molida 125 g", "Aceite 500 ml", "Gaseosa 350 ml".
 */
export const UNIDAD_INSUMO = "UNIDAD";

export const crearInsumoSchema = z.object({
  name: z.string().trim().min(2, "Escribí el nombre del insumo o producto.").max(120),
  stockCurrent: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 0 : Number(v)),
    z.number().int("El stock tiene que ser un número entero de unidades.").min(0),
  ),
  stockMin: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 0 : Number(v)),
    z.number().int().min(0),
  ),
  costCop: montoCopPositivo,
});

export const editarInsumoSchema = crearInsumoSchema.extend({
  id: z.string().min(1),
});

export const crearProveedorSchema = z.object({
  name: z.string().trim().min(2, "Escribí el nombre o razón social del proveedor.").max(120),
  taxId: textoOpcional(40),
  phone: textoOpcional(40),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.email("Escribí un correo válido.").optional(),
  ),
  address: textoOpcional(200),
});

export const lineaFacturaItemSchema = z.object({
  inventoryItemId: z.string().optional(),
  productId: z.string().optional(),
  name: z.string().optional(),
  unit: z.string().optional(),
  quantity: z.number().int().min(1, "La cantidad debe ser mayor a 0."),
  unitCostCop: z.number().int().min(0, "El costo debe ser positivo."),
  taxRateBp: z.number().int().min(0).max(10000).default(0),
});

export const crearFacturaCompraSchema = z.object({
  supplierId: textoOpcional(50),
  invoiceNumber: z.string().trim().min(1, "Ingresá el número de factura."),
  invoiceDate: z.string().trim().min(1, "Ingresá la fecha de la factura."),
  includesTax: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  itemsJson: z.string().min(2, "Agregá al menos un insumo a la factura."),
  notes: textoOpcional(300),
});

export const itemRecetaSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantityRequired: z.number().int().min(1, "La cantidad requerida debe ser mayor a 0."),
});

export const guardarRecetaSchema = z.object({
  productId: z.string().min(1, "Falta el producto."),
  itemsJson: z.string().min(2, "Agregá al menos un insumo a la receta."),
});

export const actualizarStockProductoTerminadoSchema = z.object({
  productId: z.string().min(1, "Falta el ID del producto."),
  stockQty: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 0 : Number(v)),
    z.number().int("El stock debe ser un número entero.").min(0),
  ),
});

/** El entero de stock que se escribe a mano en los formularios de inventario. */
const cantidadEntera = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? 0 : Number(v)),
  z.number().int("El stock debe ser un número entero.").min(0),
);

export const crearProductoTerminadoSchema = z.object({
  name: z.string().trim().min(2, "Escribí el nombre de la bebida o producto.").max(120),
  categoryId: z.string().min(1, "Elegí una categoría."),
  sku: textoOpcional(40),
  costCop: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 0 : Number(v)),
    z.number().int("El costo debe ser un número entero positivo.").min(0),
  ),
  priceCop: montoCopPositivo,
  stockQty: cantidadEntera,
  /** A partir de acá el producto entra en las alertas de reposición. */
  stockMin: cantidadEntera,
});

export const editarProductoTerminadoSchema = crearProductoTerminadoSchema.extend({
  productId: z.string().min(1, "Falta el ID del producto."),
});
