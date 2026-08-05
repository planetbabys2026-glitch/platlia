import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Superadministración", template: "%s · Platlia" },
  // La consola de soporte no se indexa nunca.
  robots: { index: false, follow: false },
};

/**
 * Marco de todo /superadmin, login incluido: no verifica nada, solo pone la
 * metadata. La barra de marca con el nav vive en `(consola)/layout.tsx`, aparte,
 * porque en el login no hay todavía nadie a quien saludar ni "Negocios" o
 * "Equipo" a los que mandarlo: mostrar esos enlaces antes de entrar es ruido, no
 * ayuda.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}
