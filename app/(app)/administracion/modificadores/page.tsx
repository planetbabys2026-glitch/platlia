import type { Metadata } from "next";
import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { getModificadoresAdmin } from "@/features/modificadores/queries";
import { requireRole } from "@/lib/auth/dal";
import { VistaModificadores } from "./vista-modificadores";

export const metadata: Metadata = { title: "Modificadores" };
export const dynamic = "force-dynamic";

export default async function ModificadoresPage() {
  // Verifica por su cuenta: el layout no es frontera de seguridad.
  const ctx = await requireRole(Role.ADMINISTRADOR);

  const [{ grupos, inventoryItems }, settings] = await Promise.all([
    getModificadoresAdmin(ctx.business.id),
    getSettings(ctx.business.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-[clamp(1.875rem,3vw,2.5rem)]">Modificadores</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Lo que se elige al pedir un plato: la proteína del menú del día, el término de la
          carne, las adiciones. Se crean una vez acá y se asignan a los productos que los
          usan, así cambiar el gramaje del pollo se hace en un solo lugar.
        </p>
        <Link
          href="/administracion/carta"
          className="text-brand inline-block pt-1 text-sm font-medium hover:underline"
        >
          Ver la carta →
        </Link>
      </div>

      <VistaModificadores
        grupos={grupos}
        inventoryItems={inventoryItems}
        inventoryEnabled={settings.inventoryEnabled}
      />
    </div>
  );
}
