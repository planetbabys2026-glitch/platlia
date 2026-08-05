import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logotipo } from "@/components/marca/logo";
// Cuenta superadministradores en toda la plataforma: no hay empresa que acotar.
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";
import { env } from "@/lib/env";
import { FormularioBootstrap } from "./formulario";

export const metadata: Metadata = {
  title: "Bootstrap",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Crea el superadministrador maestro. Se usa una sola vez, en el primer
 * despliegue, y después se borra `SUPERADMIN_BOOTSTRAP_TOKEN` del entorno.
 *
 * Sin esa variable la ruta responde 404 —no "no autorizado"—: así es
 * indistinguible de una ruta que no existe y no confirma que Platlia tenga una
 * puerta de bootstrap. Lo mismo cuando ya hay un superadministrador: la puerta se
 * cierra sola aunque alguien haya olvidado borrar la variable.
 */
export default async function BootstrapPage() {
  if (!env.SUPERADMIN_BOOTSTRAP_TOKEN) notFound();

  const yaHay = await rootDb.user.count({ where: { isSuperAdmin: true } });
  if (yaHay > 0) notFound();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      <Logotipo className="h-11" />

      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Crear el superadministrador
          </h1>
          <p className="text-muted-foreground text-sm">
            Se hace una sola vez. Después, borrá SUPERADMIN_BOOTSTRAP_TOKEN del entorno.
          </p>
        </div>

        <FormularioBootstrap />
      </div>
    </div>
  );
}
