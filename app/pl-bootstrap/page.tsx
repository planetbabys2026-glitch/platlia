import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logotipo } from "@/components/marca/logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
 * Rehace el superadministrador maestro. Es la puerta de recuperación para cuando
 * nadie puede entrar a `/superadmin`.
 *
 * **Lo único que la abre es `SUPERADMIN_BOOTSTRAP_TOKEN`.** Sin esa variable la
 * ruta responde 404 —no "no autorizado"—: así es indistinguible de una ruta que
 * no existe y no le confirma a nadie que Platlia tenga una puerta de
 * recuperación.
 *
 * Antes también se cerraba sola al existir el primer superadministrador. Ya no:
 * ahora borra los que haya y deja el nuevo, que es justamente para lo que sirve
 * recuperar un acceso perdido. El precio es que **la variable pasó a ser una
 * llave permanente**, y sacarla del entorno después de usarla dejó de ser una
 * recomendación.
 */
export default async function BootstrapPage() {
  if (!env.SUPERADMIN_BOOTSTRAP_TOKEN) notFound();

  const cuantos = await rootDb.user.count({ where: { isSuperAdmin: true } });

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
      <Logotipo className="h-11" />

      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-3xl">
            {cuantos > 0 ? "Rehacer el superadministrador" : "Crear el superadministrador"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Esta puerta está abierta porque SUPERADMIN_BOOTSTRAP_TOKEN sigue en el entorno.
            Sacala apenas termines.
          </p>
        </div>

        {/* Que lo diga la pantalla y no solo la documentación: esto no suma a
            alguien al equipo, lo reemplaza. Para sumar está /superadmin/equipo. */}
        {cuantos > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              Ya {cuantos === 1 ? "hay 1 superadministrador" : `hay ${cuantos} superadministradores`}.
              Al continuar {cuantos === 1 ? "pierde" : "pierden"} el acceso y queda solo el que
              escribas acá. A quien además trabaje en un negocio se le quita el acceso de soporte,
              pero su cuenta del producto sigue viva.
            </AlertDescription>
          </Alert>
        )}

        <FormularioBootstrap />
      </div>
    </div>
  );
}
