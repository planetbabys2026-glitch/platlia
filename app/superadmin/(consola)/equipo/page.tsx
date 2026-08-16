import type { Metadata } from "next";
import { getSuperAdmins } from "@/features/superadmin/queries";
import { Card, CardContent } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/dal";
import { formatBusinessDate } from "@/lib/time";
import { AccionesSuperAdmin, AgregarSuperAdmin } from "./formularios";

export const metadata: Metadata = { title: "Equipo" };
export const dynamic = "force-dynamic";

export default async function EquipoSuperAdminPage() {
  // Verifica por su cuenta: el layout no es frontera.
  const yo = await requireSuperAdmin();

  const superAdmins = await getSuperAdmins();
  const activos = superAdmins.length;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-3xl">Equipo</h1>
        <p className="text-muted-foreground text-sm">
          {activos} {activos === 1 ? "persona con" : "personas con"} acceso a la consola de
          soporte. No hay jerarquía: cualquiera puede asistir a cualquier negocio.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <h2 className="font-medium">Agregar superadministrador</h2>
          <AgregarSuperAdmin />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-medium">Con acceso</h2>
          <ul className="divide-border divide-y">
            {superAdmins.map((persona) => (
              <li key={persona.id} className="space-y-2 py-3 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="text-sm font-semibold">{persona.name}</span>
                    {persona.id === yo.id && (
                      <span className="text-muted-foreground ml-2 text-xs">(vos)</span>
                    )}
                    <span className="text-muted-foreground ml-2 text-xs">{persona.email}</span>
                  </span>
                  {persona.status !== "ACTIVO" && (
                    <span className="text-destructive text-xs">{persona.status.toLowerCase()}</span>
                  )}
                </div>

                <p className="text-muted-foreground text-xs">
                  {persona.lastLoginAt
                    ? `Último ingreso: ${formatBusinessDate(persona.lastLoginAt)}`
                    : "Todavía no ha entrado."}
                  {" · Desde "}
                  {formatBusinessDate(persona.createdAt)}
                  {persona.lockedUntil && persona.lockedUntil > new Date() && (
                    <span className="text-destructive"> · bloqueado por intentos fallidos</span>
                  )}
                </p>

                {/* Uno mismo no aparece con controles: las reglas lo rechazarían
                    igual, pero ofrecer un botón que siempre falla es una trampa. */}
                {persona.id !== yo.id && (
                  <AccionesSuperAdmin
                    userId={persona.id}
                    name={persona.name}
                    email={persona.email}
                  />
                )}
              </li>
            ))}
          </ul>

          {activos === 1 && (
            <p className="text-muted-foreground text-xs">
              Sos el único superadministrador. Si se te pierde el acceso, nadie más puede
              entrar: conviene sumar a un segundo.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
