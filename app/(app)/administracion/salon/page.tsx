import type { Metadata } from "next";
import { Role } from "@/generated/prisma/enums";
import { getSalonAdmin } from "@/features/carta/queries";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/dal";
import {
  AccionesMesa,
  ArchivarArea,
  MesasEnLote,
  NuevaArea,
  NuevaMesa,
} from "./formularios";

export const metadata: Metadata = { title: "Salón" };
export const dynamic = "force-dynamic";

const ESTADO: Record<string, string> = {
  LIBRE: "Libre",
  OCUPADA: "Ocupada",
  CUENTA_PEDIDA: "Cuenta pedida",
  RESERVADA: "Reservada",
  INACTIVA: "Fuera de servicio",
};

export default async function SalonAdminPage() {
  const ctx = await requireRole(Role.ADMINISTRADOR);
  const { areas, mesas } = await getSalonAdmin(ctx.business.id);

  const porArea = [
    ...areas.map((area) => ({
      ...area,
      mesas: mesas.filter((m) => m.areaId === area.id),
    })),
    { id: "sin-area", name: "Sin área", mesas: mesas.filter((m) => m.areaId === null) },
  ].filter((grupo) => grupo.id !== "sin-area" || grupo.mesas.length > 0);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Salón</h1>
        <p className="text-muted-foreground text-sm">
          {mesas.length} {mesas.length === 1 ? "mesa" : "mesas"} en {areas.length}{" "}
          {areas.length === 1 ? "área" : "áreas"}.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h2 className="font-medium">Áreas</h2>
            <NuevaArea />
          </div>

          <div className="space-y-3 border-t pt-4">
            <h2 className="font-medium">Crear mesas en lote</h2>
            <MesasEnLote areas={areas} />
          </div>

          <div className="space-y-3 border-t pt-4">
            <h2 className="font-medium">Agregar una mesa</h2>
            <NuevaMesa areas={areas} />
          </div>
        </CardContent>
      </Card>

      {mesas.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Todavía no hay mesas. Creá un área y cargá el lote: en un minuto tenés el salón
          armado.
        </p>
      )}

      {porArea.map((grupo) => (
        <Card key={grupo.id}>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">
                {grupo.name}
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  {grupo.mesas.length} {grupo.mesas.length === 1 ? "mesa" : "mesas"}
                </span>
              </h2>
              {grupo.id !== "sin-area" && <ArchivarArea id={grupo.id} />}
            </div>

            {grupo.mesas.length > 0 && (
              <ul className="divide-border divide-y">
                {grupo.mesas.map((mesa) => (
                  <li
                    key={mesa.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="text-sm">
                      <span className="numeral font-medium">{mesa.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {mesa.capacity} puestos · {ESTADO[mesa.status]}
                      </span>
                    </span>
                    <AccionesMesa id={mesa.id} status={mesa.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
