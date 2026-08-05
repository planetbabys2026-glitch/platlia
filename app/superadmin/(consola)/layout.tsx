import Link from "next/link";
import { getSuperAdmin } from "@/lib/auth/dal";
import { salirSuperAdmin } from "@/features/superadmin/actions";
import { Isotipo } from "@/components/marca/logo";
import { NavConsola } from "./nav";

/**
 * Marco de la consola ya autenticada: Negocios y Equipo.
 *
 * No verifica nada —un layout no se re-renderiza al navegar del lado del
 * cliente y por lo tanto no es frontera—: cada página llama a
 * `requireSuperAdmin()` por su cuenta. `getSuperAdmin()` acá es solo para
 * pintar el encabezado, igual que el layout de `(app)` con `getCurrentUser()`.
 *
 * La barra es del color de marca, no del gris neutro que usa el resto de la
 * aplicación: es la señal visual de que esto es otra puerta, entrada a
 * propósito y no por arrastre, como ya lo es la cookie y la sesión. Se usa el
 * Isotipo y no el Logotipo porque el emblema trae su propio disco y se ve igual
 * sobre cualquier fondo; el logotipo con la palabra no tiene versión para un
 * fondo de color arbitrario.
 */
export default async function ConsolaLayout({ children }: { children: React.ReactNode }) {
  const superAdmin = await getSuperAdmin();

  return (
    <>
      <header className="bg-brand text-brand-foreground">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:h-16 sm:py-0">
          <div className="flex flex-wrap items-center gap-x-6">
            <Link href="/superadmin" className="flex items-center gap-2" aria-label="Ir a Negocios">
              <Isotipo className="h-7" />
              <span className="text-sm font-medium tracking-wide opacity-90">
                Superadministración
              </span>
            </Link>

            <NavConsola />
          </div>

          <div className="flex items-center gap-4 text-sm">
            {superAdmin && (
              <span className="text-brand-foreground/75 hidden sm:inline">
                {superAdmin.email}
              </span>
            )}
            <form action={salirSuperAdmin}>
              <button
                type="submit"
                className="text-brand-foreground/75 hover:text-brand-foreground transition-colors"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">{children}</div>
    </>
  );
}
