import "server-only";
import { tenantDb } from "@/lib/db/tenant";

/**
 * El personal del negocio.
 *
 * Se consulta por Membership y no por User: el usuario es global —la misma
 * persona puede trabajar en dos bares— y lo que pertenece a esta empresa es su
 * membresía. Preguntar por usuarios cruzaría negocios.
 */
export async function getEquipo(businessId: string) {
  const miembros = await tenantDb(businessId).membership.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      active: true,
      createdAt: true,
      userId: true,
      user: {
        select: { name: true, email: true, lastLoginAt: true, lockedUntil: true },
      },
    },
  });

  return {
    miembros,
    propietariosActivos: miembros.filter((m) => m.role === "PROPIETARIO" && m.active).length,
  };
}
