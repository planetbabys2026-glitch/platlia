import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { getEquipo } from "@/features/equipo/queries";
import { getSettings } from "@/features/negocio/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/dal";
import { tienePermisoSeccion } from "@/lib/auth/permisos-roles";
import { formatDayInTimeZone } from "@/lib/time";
import { AccionesMiembro, AgregarEmpleado, ETIQUETA_ROL } from "./formularios";

export const metadata: Metadata = { title: "Equipo" };
export const dynamic = "force-dynamic";

export default async function EquipoPage() {
  const ctx = await requireRole(Role.ADMINISTRADOR, Role.CAJERO, Role.MESERO, Role.COCINA);
  const settings = await getSettings(ctx.business.id);
  if (!tienePermisoSeccion(ctx.role, "equipo", settings.rolePermissions)) {
    notFound();
  }
  const { miembros, propietariosActivos } = await getEquipo(ctx.business.id);

  const activos = miembros.filter((m) => m.active);
  const dadosDeBaja = miembros.filter((m) => !m.active);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-[clamp(1.875rem,3vw,2.5rem)]">Equipo</h1>
        <p className="text-muted-foreground text-sm">
          {activos.length} {activos.length === 1 ? "persona activa" : "personas activas"}. Cada
          rol ve solo lo suyo: el mesero no entra a caja ni a administración.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <h2 className="font-medium">Agregar a alguien</h2>
          <AgregarEmpleado />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-medium">En el negocio</h2>
          <ul className="divide-border divide-y">
            {activos.map((miembro) => (
              <li key={miembro.id} className="space-y-2 py-3 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="text-sm font-medium">{miembro.user.name}</span>
                    {miembro.userId === ctx.user.id && (
                      <span className="text-muted-foreground ml-2 text-xs">(vos)</span>
                    )}
                    <span className="text-muted-foreground ml-2 text-xs">
                      {miembro.user.email}
                    </span>
                  </span>
                  <Badge variant={miembro.role === "PROPIETARIO" ? "default" : "secondary"}>
                    {ETIQUETA_ROL[miembro.role] ?? miembro.role}
                  </Badge>
                </div>

                <p className="text-muted-foreground text-xs">
                  {miembro.user.lastLoginAt
                    ? `Último ingreso: ${formatDayInTimeZone(miembro.user.lastLoginAt, ctx.business.timeZone)}`
                    : "Todavía no ha entrado."}
                  {miembro.user.lockedUntil && miembro.user.lockedUntil > new Date() && (
                    <span className="text-destructive">
                      {" "}
                      · bloqueado por intentos fallidos
                    </span>
                  )}
                </p>

                {/* Uno mismo no aparece con controles: las reglas lo rechazarían
                    igual, pero ofrecer un botón que siempre falla es una trampa. */}
                {miembro.userId !== ctx.user.id && (
                  <AccionesMiembro
                    membershipId={miembro.id}
                    role={miembro.role}
                    active={miembro.active}
                    tieneCuentasFuera={miembro.tieneCuentasFuera}
                    puedeAscenderAPropietario={ctx.role === Role.PROPIETARIO}
                  />
                )}
              </li>
            ))}
          </ul>

          {propietariosActivos === 1 && (
            <p className="text-muted-foreground text-xs">
              Hay un solo propietario. Si se le pierde el acceso, nadie más puede nombrar a
              otro: conviene tener un segundo.
            </p>
          )}
        </CardContent>
      </Card>

      {dadosDeBaja.length > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-medium">Dados de baja</h2>
            <ul className="divide-border divide-y">
              {dadosDeBaja.map((miembro) => (
                <li key={miembro.id} className="space-y-2 py-3 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-muted-foreground text-sm">
                      {miembro.user.name}
                      <span className="ml-2 text-xs">{miembro.user.email}</span>
                    </span>
                    <Badge variant="secondary">{ETIQUETA_ROL[miembro.role]}</Badge>
                  </div>
                  <AccionesMiembro
                    membershipId={miembro.id}
                    role={miembro.role}
                    active={miembro.active}
                    tieneCuentasFuera={miembro.tieneCuentasFuera}
                    puedeAscenderAPropietario={ctx.role === Role.PROPIETARIO}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
