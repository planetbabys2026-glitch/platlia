import { AppModule, SubscriptionStatus, TaxKind } from "@/generated/prisma/enums";
import { hashPassword } from "@/lib/auth/password";
import { pool } from "@/lib/db/pool";
import { rootDb } from "@/lib/db/root";
import { exigirBaseBorrable } from "@/lib/db/base-local";
import { env } from "@/lib/env";
import { formatCop } from "@/lib/money";
import {
  AREAS,
  CARTA,
  CLAVE_SEMILLA,
  NEGOCIO,
  PERSONAS,
  SUPERADMIN,
} from "@/prisma/datos-semilla";

/**
 * Datos de desarrollo: un bar completo, listo para trabajar.
 *
 * **Arrasa y reconstruye.** Antes eran upserts idempotentes, y por eso convivía
 * con lo que iban dejando las pruebas: las de registro crean un negocio y un
 * usuario cada vez que corren y nadie los borraba nunca, así que la base se iba
 * llenando de `bar-de-prueba-*` y de cuentas `@platlia.test`, y las pruebas que
 * afirman números empezaban a fallar por acumulación. Ahora cada corrida deja la
 * base exactamente igual que la primera vez.
 *
 * Para el reset barato de todos los días —borrar la operación conservando
 * usuarios, mesas y carta— está `scripts/reset-operacion.ts`. Este es el caro.
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

/**
 * Y la guarda que de verdad hace falta: la BASE, no el proceso.
 *
 * `NODE_ENV` vale "development" en el portátil de quien desarrolla apunte
 * `DATABASE_URL` a donde apunte, así que el chequeo de arriba estaba encendido
 * solo en el servidor —donde nadie corre el seed— y apagado en el único lugar
 * donde el accidente pasa: una terminal local con la URL de producción en el
 * `.env`. Este script borra los negocios Y los usuarios: se lleva las
 * contraseñas de todo el mundo.
 */
const baseObjetivo = exigirBaseBorrable(env.DATABASE_URL, "El seed");

const CLAVE = process.env.SEED_PASSWORD ?? CLAVE_SEMILLA;
const DIA_MS = 86_400_000;

/**
 * Deja la base vacía de todo lo que este seed va a volver a crear.
 *
 * Borrar el negocio se lleva por cascada su operación, su salón, su carta y sus
 * membresías. Los usuarios no cuelgan de ningún negocio, así que van aparte —y
 * van **todos**, superadministradores incluidos: el de desarrollo se vuelve a
 * crear unas líneas más abajo, y dejarlo vivo era la única razón por la que
 * había dos scripts distintos para lo mismo.
 */
async function arrasar() {
  const negocios = await rootDb.business.deleteMany({});
  await rootDb.session.deleteMany({});
  await rootDb.verificationToken.deleteMany({});
  await rootDb.mpWebhookEvent.deleteMany({});
  const usuarios = await rootDb.user.deleteMany({});

  return { negocios: negocios.count, usuarios: usuarios.count };
}

async function main() {
  const borrado = await arrasar();
  const claveHash = await hashPassword(CLAVE);

  // ── Empresa ───────────────────────────────────────────────────────────────
  const business = await rootDb.business.create({ data: NEGOCIO });

  await rootDb.businessSettings.create({
    data: {
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
  await rootDb.businessModule.createMany({
    data: Object.values(AppModule).map((modulo) => ({
      businessId: business.id,
      module: modulo,
    })),
  });

  // ── Impuestos ─────────────────────────────────────────────────────────────
  // El defecto colombiano para bares y restaurantes es el impuesto al consumo
  // del 8%. Las otras dos quedan creadas porque cambiar de régimen es un caso
  // real y no debería requerir tocar código.
  const impoconsumo = await rootDb.taxRate.create({
    data: {
      businessId: business.id,
      name: "Impuesto al consumo",
      kind: TaxKind.IMPOCONSUMO,
      rateBp: 800,
      isDefault: true,
    },
  });
  await rootDb.taxRate.createMany({
    data: [
      { businessId: business.id, name: "IVA", kind: TaxKind.IVA, rateBp: 1900, isDefault: false },
      { businessId: business.id, name: "Exento", kind: TaxKind.EXENTO, rateBp: 0, isDefault: false },
    ],
  });

  // ── Licencia ──────────────────────────────────────────────────────────────
  const finPrueba = new Date(Date.now() + 7 * DIA_MS);
  await rootDb.subscription.create({
    data: {
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
    const userClave = "password" in persona && typeof persona.password === "string" ? persona.password : CLAVE;
    const personaHash = userClave === CLAVE ? claveHash : await hashPassword(userClave);
    const user = await rootDb.user.create({
      data: {
        email: persona.email,
        name: persona.name,
        passwordHash: personaHash,
        emailVerifiedAt: new Date(),
      },
    });

    await rootDb.membership.create({
      data: { userId: user.id, businessId: business.id, role: persona.role },
    });
  }

  // El superadministrador no pertenece a ninguna empresa: entra por /superadmin
  // con su propia cookie.
  await rootDb.user.create({
    data: {
      email: SUPERADMIN.email,
      name: SUPERADMIN.name,
      passwordHash: claveHash,
      isSuperAdmin: true,
      emailVerifiedAt: new Date(),
    },
  });

  // ── Cajas ─────────────────────────────────────────────────────────────────
  //
  // Una sola, y a propósito: la segunda hace aparecer el selector al abrir turno,
  // y esta base es la que usan los e2e para abrir y cerrar caja veinte veces. El
  // camino de varias cajas se prueba creándolas desde Configuración, que es como
  // pasa en un negocio de verdad.
  await rootDb.cashRegister.create({
    data: { businessId: business.id, name: "Caja 1", sortOrder: 0 },
  });

  // ── Salón ─────────────────────────────────────────────────────────────────
  for (const area of AREAS) {
    const creada = await rootDb.area.create({
      data: { businessId: business.id, name: area.name, sortOrder: area.sortOrder },
    });

    await rootDb.table.createMany({
      data: Array.from({ length: area.mesas }, (_, i) => ({
        businessId: business.id,
        areaId: creada.id,
        name: `${area.prefijo}${i + 1}`,
        capacity: area.capacidad,
        sortOrder: i + 1,
      })),
    });
  }

  // ── Carta ─────────────────────────────────────────────────────────────────
  for (const [indice, grupo] of CARTA.entries()) {
    const categoria = await rootDb.category.create({
      data: { businessId: business.id, name: grupo.categoria, sortOrder: indice },
    });

    await rootDb.product.createMany({
      data: grupo.productos.map((producto, orden) => ({
        businessId: business.id,
        categoryId: categoria.id,
        taxRateId: impoconsumo.id,
        sku: producto.sku,
        name: producto.name,
        priceCop: producto.priceCop,
        sortOrder: orden,
        kitchenStation: grupo.estacion,
        preparationMinutes: grupo.minutos,
      })),
    });
  }

  // Se cuenta contra la base y no sumando iteraciones: si una escritura no llegó
  // a hacerse, el resumen tiene que decirlo en vez de repetir lo que se esperaba.
  const [mesas, productos] = await Promise.all([
    rootDb.table.count({ where: { businessId: business.id } }),
    rootDb.product.count({ where: { businessId: business.id } }),
  ]);

  console.log(`
Listo. Base sembrada con datos de desarrollo.

  Base          ${baseObjetivo.nombre} en ${baseObjetivo.host}${baseObjetivo.puerto ? ":" + baseObjetivo.puerto : ""}
  Se borró      ${borrado.negocios} negocio(s) y ${borrado.usuarios} usuario(s) previos
  Empresa       ${business.name} (${business.slug})
  Licencia      prueba hasta ${finPrueba.toLocaleDateString("es-CO")}
  Mesas         ${mesas} en ${AREAS.length} áreas
  Carta         ${productos} productos en ${CARTA.length} categorías
  Impuesto      al consumo 8% incluido en el precio (${formatCop(18900)} → ${formatCop(17500)} + ${formatCop(1400)})

  Ingreso       ${PERSONAS.map((p) => p.email).join("\n                ")}
  Superadmin    ${SUPERADMIN.email}
  Contraseña    ${CLAVE}
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
