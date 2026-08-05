import Link from "next/link";
import { AppModule } from "@/generated/prisma/enums";
import { Logotipo } from "@/components/marca/logo";
import { Button } from "@/components/ui/button";
import { salir } from "@/features/auth/actions";
import { getContext } from "@/lib/auth/dal";

/**
 * Shell de la aplicación.
 *
 * OJO: esto NO es una frontera de seguridad y no debe convertirse en una. Un
 * layout no se vuelve a renderizar cuando el usuario navega del lado del cliente,
 * así que un chequeo acá dejaría pasar la segunda página. Solo lee el contexto
 * para pintar el encabezado; quien autoriza es cada `page.tsx` con el DAL.
 *
 * `getContext()` y no `getCurrentUser()`: hace falta saber si MESAS está
 * encendido para decidir entre "Salón" y "POS". No es una consulta de más —está
 * memoizada con `cache()` y cada página ya la dispara por su cuenta al llamar a
 * `requireModule`/`requireRole`— así que esto reusa el mismo resultado.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  // Sin mesas, /salon no sirve para nada: la entrada al negocio es /pos. Los
  // demás enlaces se pintan siempre —si el rol no alcanza, la página responde
  // 404 por su cuenta—, pero este caso es distinto: no es un permiso que varía
  // por persona, es una configuración del negocio que no cambia nunca sola, y
  // un enlace a Salón que jamás va a andar es un enlace roto, no una frontera.
  const usaMesas = ctx?.modules.has(AppModule.MESAS) ?? true;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-border bg-card sticky top-0 z-10 border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Link href="/panel" aria-label="Ir al panel">
              <Logotipo className="h-7" />
            </Link>

            <nav className="hidden items-center gap-4 text-sm sm:flex">
              {usaMesas ? (
                <Link href="/salon" className="hover:text-primary transition-colors">
                  Salón
                </Link>
              ) : (
                <Link href="/pos" className="hover:text-primary transition-colors">
                  POS
                </Link>
              )}
              <Link href="/cocina" className="hover:text-primary transition-colors">
                Cocina
              </Link>
              <Link href="/caja" className="hover:text-primary transition-colors">
                Caja
              </Link>
              <Link href="/informes" className="hover:text-primary transition-colors">
                Informes
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
            {ctx?.user && (
              <span className="text-muted-foreground hidden text-sm sm:inline">
                {ctx.user.name}
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
