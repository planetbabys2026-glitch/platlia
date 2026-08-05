import { AppModule, Role, SubscriptionStatus, TaxKind } from "@/generated/prisma/enums";
import { hashPassword } from "@/lib/auth/password";
import { pool } from "@/lib/db/pool";
import { rootDb } from "@/lib/db/root";
import { env } from "@/lib/env";
import { formatCop } from "@/lib/money";

/**
 * Datos de desarrollo: un bar completo, listo para trabajar.
 *
 * Es idempotente —todo son upserts sobre claves únicas—, así que se puede correr
 * las veces que haga falta sin duplicar nada ni perder lo que uno haya tocado a
 * mano en las tablas que no toca.
 *
 * Nunca corre en producción: sembrar usuarios con contraseña conocida en la base
 * real es exactamente el accidente que este bloque evita.
 */
if (env.NODE_ENV === "production") {
  throw new Error(
    "El seed no corre en producción. El superadministrador de producción se crea " +
      "una sola vez desde /pl-bootstrap con SUPERADMIN_BOOTSTRAP_TOKEN.",
  );
}

const CLAVE = process.env.SEED_PASSWORD ?? "platlia123";
const DIA_MS = 86_400_000;

const NEGOCIO = {
  slug: "bar-demo",
  name: "Bar Demo",
  legalName: "Bar Demo S.A.S.",
  taxId: "901.234.567-8",
  address: "Calle 10 # 40-25, Medellín",
  phone: "+57 300 123 4567",
  email: "hola@bardemo.co",
};

const PERSONAS = [
  { email: "dueno@platlia.com", name: "Ana Restrepo", role: Role.PROPIETARIO },
  { email: "admin@platlia.com", name: "Carlos Mejía", role: Role.ADMINISTRADOR },
  { email: "caja@platlia.com", name: "Luisa Gómez", role: Role.CAJERO },
  { email: "mesero@platlia.com", name: "Jhon Torres", role: Role.MESERO },
  { email: "cocina@platlia.com", name: "Marta Ríos", role: Role.COCINA },
] as const;

/**
 * El nombre de la mesa es único en todo el negocio, no dentro del área: el mesero
 * canta "mesa 12" y tiene que haber una sola. Por eso cada área lleva su propio
 * prefijo en vez de reiniciar la numeración, que fue justo lo que hizo colisionar
 * la terraza con el salón la primera vez.
 */
const AREAS = [
  { name: "Salón", sortOrder: 0, mesas: 12, capacidad: 4, prefijo: "" },
  { name: "Terraza", sortOrder: 1, mesas: 6, capacidad: 6, prefijo: "T" },
  { name: "Barra", sortOrder: 2, mesas: 4, capacidad: 2, prefijo: "Barra " },
] as const;

/**
 * Precios de carta reales de un bar colombiano, con el impuesto ya incluido:
 * `pricesIncludeTax` viene en true por defecto, así que esto es lo que el cliente
 * ve y lo que paga.
 */
const CARTA = [
  {
    categoria: "Cervezas",
    estacion: "Barra",
    minutos: 2,
    productos: [
      {
        sku: "CER-NAL",
        name: "Cerveza nacional",
        priceCop: 5000,
        variantes: [
          { name: "Botella", priceCop: 5000, isDefault: true },
          { name: "Litro", priceCop: 12000 },
        ],
      },
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

async function main() {
  const claveHash = await hashPassword(CLAVE);

  // ── Empresa ───────────────────────────────────────────────────────────────
  const business = await rootDb.business.upsert({
    where: { slug: NEGOCIO.slug },
    update: {},
    create: NEGOCIO,
  });

  await rootDb.businessSettings.upsert({
    where: { businessId: business.id },
    update: {},
    create: {
      businessId: business.id,
      // El encabezado es texto ADICIONAL: el nombre, el NIT y la dirección los
      // imprime el tiquete desde los datos del negocio. Repetirlos acá los
      // duplicaba en el papel.
      receiptHeader: "Régimen simple de tributación",
      receiptFooter: "¡Gracias por su visita!\nLa propina es voluntaria.",
    },
  });

  // `modulo` y no `module`: esa variable la tiene reservada CommonJS y ESLint la
  // bloquea.
  for (const modulo of Object.values(AppModule)) {
    await rootDb.businessModule.upsert({
      where: { businessId_module: { businessId: business.id, module: modulo } },
      update: {},
      create: { businessId: business.id, module: modulo },
    });
  }

  // ── Impuestos ─────────────────────────────────────────────────────────────
  // El defecto colombiano para bares y restaurantes es el impuesto al consumo
  // del 8%. Las otras dos quedan creadas porque cambiar de régimen es un caso
  // real y no debería requerir tocar código.
  const tarifas = [
    { name: "Impuesto al consumo", kind: TaxKind.IMPOCONSUMO, rateBp: 800, isDefault: true },
    { name: "IVA", kind: TaxKind.IVA, rateBp: 1900, isDefault: false },
    { name: "Exento", kind: TaxKind.EXENTO, rateBp: 0, isDefault: false },
  ];

  let impoconsumoId = "";
  for (const tarifa of tarifas) {
    const creada = await rootDb.taxRate.upsert({
      where: { businessId_name: { businessId: business.id, name: tarifa.name } },
      update: {},
      create: { businessId: business.id, ...tarifa },
    });
    if (tarifa.isDefault) impoconsumoId = creada.id;
  }

  // ── Licencia ──────────────────────────────────────────────────────────────
  const finPrueba = new Date(Date.now() + 7 * DIA_MS);
  await rootDb.subscription.upsert({
    where: { businessId: business.id },
    update: {},
    create: {
      businessId: business.id,
      status: SubscriptionStatus.PRUEBA,
      trialEndsAt: finPrueba,
      currentPeriodStart: new Date(),
      currentPeriodEnd: finPrueba,
      graceUntil: finPrueba,
    },
  });

  // ── Personas ──────────────────────────────────────────────────────────────
  for (const persona of PERSONAS) {
    const user = await rootDb.user.upsert({
      where: { email: persona.email },
      update: {},
      create: {
        email: persona.email,
        name: persona.name,
        passwordHash: claveHash,
        emailVerifiedAt: new Date(),
      },
    });

    await rootDb.membership.upsert({
      where: { userId_businessId: { userId: user.id, businessId: business.id } },
      update: {},
      create: { userId: user.id, businessId: business.id, role: persona.role },
    });
  }

  // El superadministrador no pertenece a ninguna empresa: entra por /superadmin
  // con su propia cookie.
  await rootDb.user.upsert({
    where: { email: "super@platlia.com" },
    update: {},
    create: {
      email: "super@platlia.com",
      name: "Soporte Platlia",
      passwordHash: claveHash,
      isSuperAdmin: true,
      emailVerifiedAt: new Date(),
    },
  });

  // ── Salón ─────────────────────────────────────────────────────────────────
  for (const area of AREAS) {
    const creada = await rootDb.area.upsert({
      where: { businessId_name: { businessId: business.id, name: area.name } },
      update: {},
      create: { businessId: business.id, name: area.name, sortOrder: area.sortOrder },
    });

    for (let i = 1; i <= area.mesas; i++) {
      const name = `${area.prefijo}${i}`;
      await rootDb.table.upsert({
        where: { businessId_name: { businessId: business.id, name } },
        update: {},
        create: {
          businessId: business.id,
          areaId: creada.id,
          name,
          capacity: area.capacidad,
          sortOrder: i,
        },
      });
    }
  }

  // ── Carta ─────────────────────────────────────────────────────────────────
  for (const [indice, grupo] of CARTA.entries()) {
    const categoria = await rootDb.category.upsert({
      where: { businessId_name: { businessId: business.id, name: grupo.categoria } },
      update: {},
      create: { businessId: business.id, name: grupo.categoria, sortOrder: indice },
    });

    for (const [orden, producto] of grupo.productos.entries()) {
      const creado = await rootDb.product.upsert({
        where: { businessId_sku: { businessId: business.id, sku: producto.sku } },
        update: {},
        create: {
          businessId: business.id,
          categoryId: categoria.id,
          taxRateId: impoconsumoId,
          sku: producto.sku,
          name: producto.name,
          priceCop: producto.priceCop,
          sortOrder: orden,
          kitchenStation: grupo.estacion,
          preparationMinutes: grupo.minutos,
        },
      });
      for (const [ordenVariante, variante] of ("variantes" in producto
        ? producto.variantes
        : []
      ).entries()) {
        await rootDb.productVariant.upsert({
          where: { productId_name: { productId: creado.id, name: variante.name } },
          update: {},
          create: {
            businessId: business.id,
            productId: creado.id,
            name: variante.name,
            priceCop: variante.priceCop,
            isDefault: "isDefault" in variante ? variante.isDefault : false,
            sortOrder: ordenVariante,
          },
        });
      }
    }
  }

  // Se cuenta contra la base, no sumando iteraciones del bucle: un upsert que
  // choca contra una clave única no crea nada y el resumen mentiría.
  const [mesas, productos] = await Promise.all([
    rootDb.table.count({ where: { businessId: business.id } }),
    rootDb.product.count({ where: { businessId: business.id } }),
  ]);

  console.log(`
Listo. Base sembrada con datos de desarrollo.

  Empresa      ${business.name} (${business.slug})
  Licencia     prueba hasta ${finPrueba.toLocaleDateString("es-CO")}
  Mesas        ${mesas} en ${AREAS.length} áreas
  Carta        ${productos} productos en ${CARTA.length} categorías
  Impuesto     al consumo 8% incluido en el precio (${formatCop(18900)} → ${formatCop(17500)} + ${formatCop(1400)})

  Ingreso      ${PERSONAS.map((p) => p.email).join("\n               ")}
  Superadmin   super@platlia.com
  Contraseña   ${CLAVE}
`);
}

main()
  .catch((error) => {
    console.error("El seed falló:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await rootDb.$disconnect();
    // rootDb comparte el pool de lib/db/pool.ts y no lo cierra al desconectarse:
    // sin esto el proceso queda colgado con el socket abierto.
    await pool.end();
  });
