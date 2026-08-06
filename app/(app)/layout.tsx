import { AppModule } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { getContext } from "@/lib/auth/dal";
import { AppShell } from "./app-shell";

/**
 * Shell principal de la aplicación con barra lateral izquierda colapsable
 * y menú desplegable responsivo para celulares y tabletas.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const usaMesas = ctx?.modules.has(AppModule.MESAS) ?? true;

  let usaInventario = false;
  if (ctx?.business?.id) {
    try {
      const settings = await getSettings(ctx.business.id);
      usaInventario = settings.inventoryEnabled;
    } catch {
      // Si la empresa aún no tiene settings cargados
    }
  }

  const puedeVerInventario = Boolean(
    usaInventario &&
      ctx?.role &&
      ["PROPIETARIO", "ADMINISTRADOR", "CAJERO"].includes(ctx.role),
  );

  return (
    <AppShell
      user={ctx?.user ?? null}
      businessName={ctx?.business?.name}
      role={ctx?.role ?? null}
      usaMesas={usaMesas}
      puedeVerInventario={puedeVerInventario}
    >
      {children}
    </AppShell>
  );
}
