import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Superadministración", template: "%s · Platlia" },
  // La consola de soporte no se indexa nunca.
  robots: { index: false, follow: false },
};

/**
 * Marco de superadministración.
 *
 * No verifica nada: un layout no se re-renderiza al navegar del lado del cliente
 * y por lo tanto no es frontera. Cada página llama a `requireSuperAdmin()`.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}
