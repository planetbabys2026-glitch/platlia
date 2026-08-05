import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";

const SECCIONES = [
  { href: "/administracion/carta", label: "Carta" },
  { href: "/administracion/salon", label: "Salón" },
  { href: "/administracion/equipo", label: "Equipo" },
  { href: "/administracion/configuracion", label: "Configuración" },
] as const;

/**
 * Marco de administración.
 *
 * El `requireRole` de acá es para no pintar la navegación a quien no corresponde,
 * NO es la frontera: un layout no se re-renderiza al navegar del lado del
 * cliente. Cada página de adentro vuelve a verificar por su cuenta.
 */
export default async function AdministracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(Role.ADMINISTRADOR);

  return (
    <div className="space-y-6">
      <nav className="border-border flex gap-1 border-b">
        {SECCIONES.map((seccion) => (
          <Link
            key={seccion.href}
            href={seccion.href}
            className="hover:border-primary hover:text-primary -mb-px border-b-2 border-transparent px-3 py-2 text-sm transition-colors"
          >
            {seccion.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
