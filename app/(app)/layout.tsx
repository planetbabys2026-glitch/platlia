import { AppModule } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { requireBusiness } from "@/lib/auth/dal";
import { AppShell } from "./app-shell";

/**
 * Shell principal de la aplicación con barra lateral izquierda colapsable
 * y menú desplegable responsivo para celulares y tabletas.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireBusiness();
  const usaMesas = ctx.modules.has(AppModule.MESAS);

  let usaInventario = false;
  let usaDomicilios = true;

  if (ctx.business.id) {
    try {
      const settings = await getSettings(ctx.business.id);
      usaInventario = settings.inventoryEnabled;
      usaDomicilios = settings.deliveryEnabled;
    } catch {
      // Si la empresa aún no tiene settings cargados
    }
  }

  const puedeVerInventario = Boolean(
    usaInventario &&
      ctx.role &&
      ["PROPIETARIO", "ADMINISTRADOR", "CAJERO"].includes(ctx.role),
  );

  return (
    <AppShell
      user={ctx.user}
      businessName={ctx.business.name}
      role={ctx.role}
      usaMesas={usaMesas}
      usaDomicilios={usaDomicilios}
      puedeVerInventario={puedeVerInventario}
    >
      {children}
    </AppShell>
  );
}
