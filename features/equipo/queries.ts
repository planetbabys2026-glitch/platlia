import "server-only";
import { tenantDb } from "@/lib/db/tenant";
import { sedesDeLaMismaCuenta } from "@/lib/billing/cuenta";
// Las sedes hermanas se resuelven cruzando negocios por definición: es una de
// las tres excepciones previstas por la regla (auth, billing, superadmin).
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";

/**
 * El personal del negocio.
 *
 * Se consulta por Membership y no por User: el usuario es global —la misma
 * persona puede trabajar en dos bares— y lo que pertenece a esta empresa es su
 * membresía. Preguntar por usuarios cruzaría negocios.
 */
export async function getEquipo(businessId: string) {
  // Las otras sedes del mismo dueño NO cuentan como "afuera": son suyas. Tiene
  // que ser la misma definición que usa `restablecerContrasena`, o la pantalla
  // esconde el campo de contraseña en un caso que la acción sí permite —y una
  // pantalla que no coincide con la acción es peor que cualquiera de las dos—.
  const sedesPropias = await sedesDeLaMismaCuenta(rootDb, businessId);

  const miembros = await tenantDb(businessId).membership.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      active: true,
      createdAt: true,
      userId: true,
      user: {
        select: {
          name: true,
          email: true,
          lastLoginAt: true,
          lockedUntil: true,
          // Con cuántos negocios más trabaja esta persona. No se traen cuáles
          // —eso sería contarle a un negocio dónde más trabaja su empleado, que
          // no es asunto suyo—: alcanza con saber si hay alguno.
          //
          // Lo necesita la pantalla para no ofrecer un campo de contraseña que
          // la acción va a rechazar: `User.passwordHash` es de la persona y no
          // de este negocio, así que a quien trabaja en otro lado se le manda un
          // enlace de recuperación en vez de escribirle una clave.
          _count: {
            select: {
              memberships: {
                where: {
                  businessId: { notIn: sedesPropias },
                  active: true,
                  business: { deletedAt: null },
                },
              },
            },
          },
        },
      },
    },
  });

  return {
    miembros: miembros.map((m) => ({
      ...m,
      tieneCuentasFuera: m.user._count.memberships > 0,
    })),
    propietariosActivos: miembros.filter((m) => m.role === "PROPIETARIO" && m.active).length,
  };
}
