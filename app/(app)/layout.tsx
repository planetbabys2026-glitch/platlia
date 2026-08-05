import Link from "next/link";
import { Logotipo } from "@/components/marca/logo";
import { Button } from "@/components/ui/button";
import { salir } from "@/features/auth/actions";
import { getCurrentUser } from "@/lib/auth/dal";

/**
 * Shell de la aplicación.
 *
 * OJO: esto NO es una frontera de seguridad y no debe convertirse en una. Un
 * layout no se vuelve a renderizar cuando el usuario navega del lado del cliente,
 * así que un chequeo acá dejaría pasar la segunda página. Solo lee el usuario
 * para pintar el encabezado; quien autoriza es cada `page.tsx` con el DAL.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-border bg-card sticky top-0 z-10 border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Link href="/panel" aria-label="Ir al panel">
              <Logotipo className="h-7" />
            </Link>

            {/* Los tres lugares donde se trabaja. Los enlaces se pintan siempre:
                si el módulo está apagado o el rol no alcanza, la página responde
                404 por su cuenta. */}
            <nav className="hidden items-center gap-4 text-sm sm:flex">
              <Link href="/salon" className="hover:text-primary transition-colors">
                Salón
              </Link>
              <Link href="/cocina" className="hover:text-primary transition-colors">
                Cocina
              </Link>
              <Link href="/caja" className="hover:text-primary transition-colors">
                Caja
              </Link>
              <Link
                href="/administracion/carta"
                className="hover:text-primary transition-colors"
              >
                Administración
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <span className="text-muted-foreground hidden text-sm sm:inline">
                {user.name}
              </span>
            )}
            <form action={salir}>
              <Button type="submit" variant="ghost" size="sm">
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
