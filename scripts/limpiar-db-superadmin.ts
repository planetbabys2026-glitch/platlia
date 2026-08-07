import { pool } from "../lib/db/pool";
import { rootDb } from "../lib/db/root";

async function main() {
  console.log("🧹 Limpiando base de datos y dejando únicamente superadministradores...");

  // 1. Eliminar empresas (Cascada limpia BusinessSettings, Subscription, Area, Table, Order, Category, Product, etc.)
  const resEmpresas = await rootDb.business.deleteMany({});
  console.log(`✅ Empresas eliminadas: ${resEmpresas.count}`);

  // 2. Eliminar sesiones APP y tokens
  await rootDb.session.deleteMany({ where: { kind: "APP" } });
  await rootDb.verificationToken.deleteMany({});
  await rootDb.mpWebhookEvent.deleteMany({});

  // 3. Eliminar usuarios normales (mantener solo superadministradores)
  const borrados = await rootDb.user.deleteMany({
    where: { isSuperAdmin: false },
  });

  console.log(`✅ Usuarios normales eliminados: ${borrados.count}`);
  
  const superAdmins = await rootDb.user.findMany({
    where: { isSuperAdmin: true },
    select: { email: true, name: true, isSuperAdmin: true, status: true },
  });
  console.log("👑 Superadministradores preservados:");
  console.table(superAdmins);
}

main()
  .catch((e) => {
    console.error("❌ Error limpiando base de datos:", e);
    process.exit(1);
  })
  .finally(() => {
    void pool.end();
  });
