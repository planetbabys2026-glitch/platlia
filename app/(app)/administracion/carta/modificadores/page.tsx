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
        <h1 className="text-2xl font-semibold tracking-tight">Modificadores</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Lo que se elige al pedir un plato: la proteína del menú del día, el término de la
          carne, las adiciones. Se crean una vez acá y se asignan a los productos que los
          usan, así cambiar el gramaje del pollo se hace en un solo lugar.
        </p>
        <Link
          href="/administracion/carta"
          className="text-brand inline-block pt-1 text-sm font-medium hover:underline"
        >
          ← Volver a la carta
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
