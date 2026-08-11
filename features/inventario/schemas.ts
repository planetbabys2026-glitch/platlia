import { z } from "zod";
import { montoCopPositivo, textoOpcional } from "@/lib/validaciones";

export const crearInsumoSchema = z.object({
  name: z.string().trim().min(2, "Escribí el nombre del insumo o producto.").max(120),
  sku: textoOpcional(40),
  unit: z.string().trim().min(1, "Elegí o escribí la unidad de medida.").max(20),
  stockCurrent: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 0 : Number(v)),
    z.number().int("El stock debe ser un número entero (ej. 1500 gramos o 10 unidades).").min(0),
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
  inventoryItemId: z.string().min(1, "Elegí el insumo."),
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

export const crearProductoTerminadoSchema = z.object({
  name: z.string().trim().min(2, "Escribí el nombre de la bebida o producto.").max(120),
  categoryId: z.string().min(1, "Elegí una categoría."),
  sku: textoOpcional(40),
  costCop: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 0 : Number(v)),
    z.number().int("El costo debe ser un número entero positivo.").min(0),
  ),
  priceCop: montoCopPositivo,
  stockQty: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 0 : Number(v)),
    z.number().int("El stock debe ser un número entero.").min(0),
  ),
});

export const editarProductoTerminadoSchema = crearProductoTerminadoSchema.extend({
  productId: z.string().min(1, "Falta el ID del producto."),
});
