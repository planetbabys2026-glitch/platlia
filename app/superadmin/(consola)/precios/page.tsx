import type { Metadata } from "next";
import { getListasDePrecios } from "@/features/superadmin/queries";
import { requireSuperAdmin } from "@/lib/auth/dal";
import { listaVigente } from "@/lib/billing/precios";
import { diaFinalDeVentana, formatDayInTimeZone, ZONA_PLATAFORMA } from "@/lib/time";
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
          tramos: l.tramos.map((t) => ({
            desdeSedes: t.desdeSedes,
            precioMensualCop: t.precioMensualCop,
          })),
          desde: l.desde ? formatDayInTimeZone(l.desde, ZONA_PLATAFORMA) : null,
          // `hasta` se guarda como el arranque del día siguiente —el día escrito
          // cuenta entero—, así que para volver a mostrarlo hay que retroceder.
          hasta: l.hasta
            ? formatDayInTimeZone(diaFinalDeVentana(l.hasta), ZONA_PLATAFORMA)
            : null,
          activa: l.activa,
        }))}
        idVigente={vigente.id}
      />
    </div>
  );
}
