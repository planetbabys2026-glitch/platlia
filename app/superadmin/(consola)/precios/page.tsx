import type { Metadata } from "next";
import { getListasDePrecios } from "@/features/superadmin/queries";
import { requireSuperAdmin } from "@/lib/auth/dal";
import { listaVigente } from "@/lib/billing/precios";
import { VistaPrecios } from "./vista-precios";

export const metadata: Metadata = { title: "Precios · Superadmin" };
export const dynamic = "force-dynamic";

export default async function PreciosPage() {
  // Cada página verifica por su cuenta: el layout no es frontera de seguridad.
  await requireSuperAdmin();

  const listas = await getListasDePrecios();
  const vigente = listaVigente(listas);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-black uppercase leading-[0.95] tracking-tight text-foreground">
          Precios
        </h1>
        <p className="text-sm text-muted-foreground">
          Lo que cobra Platlia. Es de dónde salen los totales de la portada, de la
          pantalla de licencia y del cobro por MercadoPago.
        </p>
      </div>

      <VistaPrecios
        listas={listas.map((l) => ({
          id: l.id,
          nombre: l.nombre,
          precioSedePrincipalCop: l.precioSedePrincipalCop,
          precioSedeAdicionalCop: l.precioSedeAdicionalCop,
          mesesGratisSemestral: l.mesesGratisSemestral,
          mesesGratisAnual: l.mesesGratisAnual,
          desde: l.desde ? l.desde.toISOString().slice(0, 10) : null,
          hasta: l.hasta ? l.hasta.toISOString().slice(0, 10) : null,
          activa: l.activa,
        }))}
        idVigente={vigente.id}
      />
    </div>
  );
}
