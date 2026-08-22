/**
 * Los datos del bar de desarrollo, en un módulo sin imports ni efectos.
 *
 * Viven acá y no adentro de `prisma/seed.ts` para que **el seed y las pruebas
 * afirmen los mismos números**. Antes no era así y se pagaba: `auth.spec.ts`
 * comprobaba "17 productos en carta" contra un seed que ya sembraba 18, y la
 * prueba fallaba por estar vieja, no por una regresión. Ahora la prueba cuenta
 * `PRODUCTOS_EN_CARTA` y no puede quedar desactualizada.
 *
 * Sin `server-only` y sin importar nada —ni siquiera los enums generados, cuyos
 * valores acá son literales— para que se pueda leer desde el seed, desde vitest
 * y desde Playwright por igual.
 */

export const CLAVE_SEMILLA = "platlia123";

export const NEGOCIO = {
  slug: "bar-demo",
  name: "Bar Demo",
  legalName: "Bar Demo S.A.S.",
  taxId: "901.234.567-8",
  address: "Calle 10 # 40-25, Medellín",
  phone: "+57 300 123 4567",
  email: "hola@bardemo.co",
} as const;

export const PERSONAS = [
  { email: "dueno@platlia.com", name: "Ana Restrepo", role: "PROPIETARIO" },
  { email: "jccg@platlia.com", name: "JCCG Admin", role: "PROPIETARIO", password: "jccg2105" },
  { email: "admin@test.com", name: "Admin Test", role: "PROPIETARIO", password: "jccg2105." },
  { email: "admin@platlia.com", name: "Carlos Mejía", role: "ADMINISTRADOR" },
  { email: "caja@platlia.com", name: "Luisa Gómez", role: "CAJERO" },
  { email: "mesero@platlia.com", name: "Jhon Torres", role: "MESERO" },
  { email: "cocina@platlia.com", name: "Marta Ríos", role: "COCINA" },
] as const;

export const SUPERADMIN = {
  email: "super@platlia.com",
  name: "Soporte Platlia",
} as const;

/**
 * El nombre de la mesa es único en todo el negocio, no dentro del área: el mesero
 * canta "mesa 12" y tiene que haber una sola. Por eso cada área lleva su propio
 * prefijo en vez de reiniciar la numeración, que fue justo lo que hizo colisionar
 * la terraza con el salón la primera vez.
 */
export const AREAS = [
  { name: "Salón", sortOrder: 0, mesas: 12, capacidad: 4, prefijo: "" },
  { name: "Terraza", sortOrder: 1, mesas: 6, capacidad: 6, prefijo: "T" },
  { name: "Barra", sortOrder: 2, mesas: 4, capacidad: 2, prefijo: "Barra " },
] as const;

/**
 * Precios de carta reales de un bar colombiano, con el impuesto ya incluido:
 * `pricesIncludeTax` viene en true por defecto, así que esto es lo que el cliente
 * ve y lo que paga.
 */
export const CARTA = [
  {
    categoria: "Cervezas",
    estacion: "Barra",
    minutos: 2,
    productos: [
      { sku: "CER-NAL-BOT", name: "Cerveza nacional (Botella)", priceCop: 5000 },
      { sku: "CER-NAL-LIT", name: "Cerveza nacional (Litro)", priceCop: 12000 },
      { sku: "CER-IMP", name: "Cerveza importada", priceCop: 9000 },
      { sku: "CER-MICH", name: "Michelada", priceCop: 8000 },
    ],
  },
  {
    categoria: "Cócteles",
    estacion: "Barra",
    minutos: 6,
    productos: [
      { sku: "COC-MOJ", name: "Mojito", priceCop: 22000 },
      { sku: "COC-CUB", name: "Cuba libre", priceCop: 18000 },
      { sku: "COC-APE", name: "Aperol spritz", priceCop: 28000 },
    ],
  },
  {
    categoria: "Picadas",
    estacion: "Cocina",
    minutos: 15,
    productos: [
      { sku: "PIC-PER", name: "Picada personal", priceCop: 28000 },
      { sku: "PIC-COM", name: "Picada para compartir", priceCop: 65000 },
      { sku: "PIC-PAP", name: "Papas a la francesa", priceCop: 12000 },
      { sku: "PIC-ALI", name: "Alitas BBQ (8 unidades)", priceCop: 32000 },
    ],
  },
  {
    categoria: "Platos fuertes",
    estacion: "Cocina",
    minutos: 25,
    productos: [
      { sku: "PLA-BAN", name: "Bandeja paisa", priceCop: 32000 },
      { sku: "PLA-CHU", name: "Churrasco 300 g", priceCop: 45000 },
      { sku: "PLA-TRU", name: "Trucha al ajillo", priceCop: 38000 },
    ],
  },
  {
    categoria: "Sin alcohol",
    estacion: "Barra",
    minutos: 3,
    productos: [
      { sku: "SIN-GAS", name: "Gaseosa", priceCop: 4500 },
      { sku: "SIN-LIM", name: "Limonada natural", priceCop: 7000 },
      { sku: "SIN-AGU", name: "Agua", priceCop: 3500 },
      { sku: "SIN-CAF", name: "Café", priceCop: 3000 },
    ],
  },
] as const;

/** Cuántas mesas siembra el seed, sumando las tres áreas. */
export const MESAS_EN_SALON = AREAS.reduce((n, a) => n + a.mesas, 0);

/** Cuántos productos siembra el seed, sumando las cinco categorías. */
export const PRODUCTOS_EN_CARTA = CARTA.reduce((n, c) => n + c.productos.length, 0);
