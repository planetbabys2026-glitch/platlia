import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";

/**
 * Marco de administración.
 *
 * `requireRole` para verificar permiso antes de renderizar páginas de administración.
 */
export default async function AdministracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(Role.ADMINISTRADOR);

  return <div className="space-y-6">{children}</div>;
}
