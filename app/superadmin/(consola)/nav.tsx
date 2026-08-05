"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SECCIONES = [
  { href: "/superadmin", etiqueta: "Negocios" },
  { href: "/superadmin/auditoria", etiqueta: "Auditoría y Pagos" },
  { href: "/superadmin/equipo", etiqueta: "Equipo" },
] as const;

/** Nav de la consola, con la sección actual marcada: en un panel que se usa a
 *  diario conviene saber de un vistazo dónde estás parado. */
export function NavConsola() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-5 text-sm">
      {SECCIONES.map((seccion) => {
        const activa = pathname === seccion.href;
        return (
          <Link
            key={seccion.href}
            href={seccion.href}
            aria-current={activa ? "page" : undefined}
            className={cn(
              "border-b-2 pb-1 transition-colors",
              activa
                ? "border-brand-accent text-brand-foreground font-medium"
                : "text-brand-foreground/70 hover:text-brand-foreground border-transparent",
            )}
          >
            {seccion.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
