/**
 * Clasificación de los modelos del schema en "de empresa" y "globales".
 *
 * Vive en su propio módulo, sin un solo import, por dos razones: lo consume la
 * extensión de tenantDb (que arrastra Prisma y la configuración de entorno) y lo
 * consume el test que lo contrasta contra el schema, que tiene que poder correr
 * sin levantar nada.
 *
 * Prisma 7 ya no expone el DMMF en tiempo de ejecución, así que la lista es
 * manual. tests/unit/tenant-scope.test.ts la compara contra prisma/schema.prisma
 * y falla nombrando el modelo que quedó sin clasificar.
 */

/** Modelos que llevan `businessId`: tenantDb los acota a la empresa de la sesión. */
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  "BusinessSettings",
  "BusinessModule",
  "TaxRate",
  "Membership",
  "Session",
  "Subscription",
  "SubscriptionPayment",
  "Category",
  "Product",
  "Area",
  "Table",
  "Order",
  "OrderItem",
  "OrderPayment",
  "CashSession",
  "CashMovement",
  "AuditLog",
  "InventoryItem",
  "Supplier",
  "PurchaseInvoice",
  "PurchaseInvoiceItem",
  "ProductRecipeItem",
  "InventoryMovement",
  "ModifierGroup",
  "ModifierOption",
  "ModifierOptionSupply",
  "ProductModifierGroup",
  "OrderItemModifier",
  // Impresión: la impresora, su ruta, la cola y el agente son de una sucursal.
  // El agente se autentica con su token y desde ahí se acota como cualquier otro.
  "Printer",
  "PrintRoute",
  "PrintJob",
  "PrintAgent",
]);

/**
 * Modelos sin dueño. No se alcanzan desde tenantDb: el acceso pasa por rootDb,
 * que es donde la excepción queda visible en el diff.
 *
 * `User` es global a propósito —la misma persona puede trabajar en dos negocios—,
 * así que la forma correcta de listar el personal de una empresa es consultar
 * Membership e incluir el usuario.
 */
export const GLOBAL_MODELS: ReadonlySet<string> = new Set([
  "User",
  "VerificationToken",
  "MpWebhookEvent",
  "PlaceholderImage",
  // La lista de precios es de Platlia, no de un negocio: la edita el
  // superadministrador y la leen todos por igual.
  "ListaDePrecios",
  // Sus escalones por cantidad de sedes cuelgan de la lista, así que son de la
  // plataforma por la misma razón.
  "TramoDePrecios",
  // La bolsa de documentos electrónicos también: se le compra a Factus a nombre
  // de la plataforma y después se reparte entre los negocios.
  "CompraDocumentosDian",
]);

/**
 * `Business` es el único modelo que se acota por `id` en lugar de `businessId`:
 * desde una sesión solo existe la empresa propia.
 */
export const ROOT_TENANT_MODEL = "Business";
