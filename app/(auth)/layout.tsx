import Link from "next/link";
import { Logotipo } from "@/components/marca/logo";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

/**
 * Marco de las pantallas sin sesión. No verifica nada: no es una frontera de
 * seguridad, solo el encuadre. Quien decide si hay sesión es el DAL, en cada
 * página.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      {/* Botón explícito para regresar a la página principal */}
      <div className="w-full max-w-sm flex items-center justify-start">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <Link href="/" aria-label="Volver a la página principal">
            <ArrowLeft className="size-4" />
            <span>Volver a la página principal</span>
          </Link>
        </Button>
      </div>

      <Link href="/" aria-label="Ir al inicio" className="transition-opacity hover:opacity-90">
        <Logotipo priority className="h-11" />
      </Link>

      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
