import { AppModule } from "@/generated/prisma/enums";
import { contarComandasVivas } from "@/features/cocina/queries";
import { contarDomiciliosActivos } from "@/features/domicilios/queries";
import { getSettings } from "@/features/negocio/queries";
import { requireBusiness } from "@/lib/auth/dal";
import { currentBusinessDate } from "@/lib/time";
import { AppShell } from "./app-shell";

/**
 * Shell principal de la aplicación con barra lateral izquierda colapsable
 * y menú desplegable responsivo para celulares y tabletas.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireBusiness();
  const usaMesas = ctx.modules.has(AppModule.MESAS);
  const usaCocina = ctx.modules.has(AppModule.COCINA);

  let usaInventario = false;
  let usaDomicilios = true;
  let cocinaInicial = 0;
  let domiciliosInicial = 0;

  if (ctx.business.id) {
    try {
      const settings = await getSettings(ctx.business.id);
      usaInventario = settings.inventoryEnabled;
      usaDomicilios = settings.deliveryEnabled;

      // Los contadores del menú se calculan acá para que la primera pintura ya
      // traiga el número: el stream los refresca después, pero sin esto la
      // insignia arranca en cero y salta a tres medio segundo más tarde.
      [cocinaInicial, domiciliosInicial] = await Promise.all([
        usaCocina
          ? contarComandasVivas(ctx.business.id, currentBusinessDate(settings))
          : Promise.resolve(0),
        usaDomicilios ? contarDomiciliosActivos(ctx.business.id) : Promise.resolve(0),
      ]);
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
      usaCocina={usaCocina}
      usaDomicilios={usaDomicilios}
      puedeVerInventario={puedeVerInventario}
      cocinaInicial={cocinaInicial}
      domiciliosInicial={domiciliosInicial}
    >
      {children}
    </AppShell>
  );
}
