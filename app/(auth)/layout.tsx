import Link from "next/link";
import { Logotipo } from "@/components/marca/logo";

/**
 * Marco de las pantallas sin sesión. No verifica nada: no es una frontera de
 * seguridad, solo el encuadre. Quien decide si hay sesión es el DAL, en cada
 * página.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      <Link href="/" aria-label="Ir al inicio">
        <Logotipo priority className="h-11" />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
