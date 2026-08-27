import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppModule, Role } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { requireActiveLicense } from "@/lib/auth/dal";
import { tienePermisoSeccion } from "@/lib/auth/permisos-roles";

export const metadata: Metadata = { title: "Entrando…" };
export const dynamic = "force-dynamic";

/**
 * A dónde entra cada quien.
 *
 * Antes acá había un panel con tres contadores —mesas, productos, si la caja
 * estaba abierta— y dos botones para ir a trabajar. Nadie los miraba: quien entra
 * a las siete de la tarde va a atender, no a leer indicadores, y el panel era una
 * pantalla de paso que había que cerrar antes de empezar. Los avisos que sí
 * importaban —licencia en gracia, correo sin confirmar— viven ahora en el shell,
 * donde se ven desde cualquier pantalla y no solo desde una que nadie abre.
 *
 * La ruta se queda porque medio producto redirige acá después de entrar; lo que
 * cambió es que ya no pinta nada: reparte.
 */
export default async function PanelPage() {
  // Verifica por su cuenta, como todas: sesión + empresa + licencia.
  const ctx = await requireActiveLicense();
  const settings = await getSettings(ctx.business.id);
  const usaMesas = ctx.modules.has(AppModule.MESAS);

  // La cocina entra a su monitor: no vende ni cobra.
  if (ctx.role === Role.COCINA) redirect("/cocina");

  if (usaMesas && tienePermisoSeccion(ctx.role, "salon_pos", settings.rolePermissions)) {
    redirect("/salon");
  }

  // Sin mesas —o sin permiso de salón— entra por el mostrador quien pueda vender.
  if (tienePermisoSeccion(ctx.role, "pos", settings.rolePermissions)) {
    redirect("/pos");
  }

  /**
   * No hay a dónde mandarlo, y hay que decirlo.
   *
   * El caso real: un negocio de mostrador que da de alta a un mesero. El mesero
   * atiende mesas y este negocio no tiene, así que su pantalla no existe. Antes
   * caía en el panel y veía dos botones que no llevaban a ninguna parte.
   */
  return (
    <div className="mx-auto max-w-lg pt-10">
      <Card className="border-warning">
        <CardContent className="space-y-3 p-6">
          <CardTitle className="text-warning text-base">
            {usaMesas ? "Todavía no tenés una pantalla asignada" : "Este negocio no tiene mesas"}
          </CardTitle>
          <CardDescription className="leading-relaxed">
            {usaMesas ? (
              <>
                Tu usuario no tiene permiso sobre ninguna pantalla de operación. Pedile al
                administrador del restaurante que te habilite el salón o el punto de venta.
              </>
            ) : (
              <>
                Tu rol es <strong className="text-foreground">mesero</strong> y trabajás sobre el
                salón, pero este negocio tiene las mesas apagadas. Pedile al administrador del
                restaurante que habilite las mesas en{" "}
                <span className="text-foreground">Configuración → Módulos</span>, o que te cambie
                el rol si vas a vender de mostrador.
              </>
            )}
          </CardDescription>
          <p className="text-muted-foreground text-xs">
            {ctx.user.name} · {ctx.business.name}
          </p>
          <Link
            href="/turnero"
            className="text-brand inline-block text-sm font-medium hover:underline"
          >
            Ver el turnero mientras tanto →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
