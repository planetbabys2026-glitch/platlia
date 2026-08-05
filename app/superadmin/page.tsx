import type { Metadata } from "next";
import {
  getNegocios,
  getResumenPlataforma,
  getWebhooksConError,
} from "@/features/superadmin/queries";
import { salirSuperAdmin } from "@/features/superadmin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/dal";
import { diasParaElCorte } from "@/lib/billing/suscripcion";
import { formatCop } from "@/lib/money";
import { formatBusinessDate } from "@/lib/time";
import { AccionesNegocio } from "./acciones";

export const metadata: Metadata = { title: "Negocios" };
export const dynamic = "force-dynamic";

const ESTADO_LICENCIA: Record<string, string> = {
  PRUEBA: "En prueba",
  ACTIVA: "Al día",
  VENCIDA: "Vencida",
  SUSPENDIDA: "Suspendida",
  CANCELADA: "Cancelada",
};

export default async function SuperAdminPage() {
  // Verifica por su cuenta: el layout no es frontera.
  const superAdmin = await requireSuperAdmin();

  const [negocios, resumen, webhooks] = await Promise.all([
    getNegocios(),
    getResumenPlataforma(),
    getWebhooksConError(),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Superadministración</h1>
          <p className="text-muted-foreground text-sm">{superAdmin.email}</p>
        </div>
        <form action={salirSuperAdmin}>
          <Button type="submit" variant="ghost" size="sm">
            Salir
          </Button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Negocios" valor={resumen.negocios} />
        <Indicador titulo="Con licencia viva" valor={resumen.conLicenciaViva} />
        <Indicador titulo="Usuarios" valor={resumen.usuarios} />
        <Indicador
          titulo="Recaudado"
          valor={formatCop(resumen.recaudadoCop)}
          detalle={`${resumen.pagosAprobados} pagos aprobados`}
        />
      </div>

      {webhooks.length > 0 && (
        <Card className="border-destructive">
          <CardContent className="space-y-3">
            <h2 className="font-medium">Avisos de MercadoPago que fallaron</h2>
            <p className="text-muted-foreground text-xs">
              Es lo primero que se mira cuando alguien dice &quot;pagué y no me activaron&quot;.
            </p>
            <ul className="divide-border divide-y text-sm">
              {webhooks.map((w) => (
                <li key={w.id} className="space-y-0.5 py-2 first:pt-0">
                  <div className="flex justify-between gap-2">
                    <span className="numeral text-xs">{w.mpEventId}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatBusinessDate(w.receivedAt)}
                    </span>
                  </div>
                  <p className="text-destructive text-xs">{w.error}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-medium">Negocios</h2>
          <ul className="divide-border divide-y">
            {negocios.map((negocio) => {
              const sub = negocio.subscription;
              const dias = sub ? diasParaElCorte(sub) : null;

              return (
                <li key={negocio.id} className="space-y-2 py-3 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span className="font-medium">{negocio.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{negocio.slug}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {negocio.status !== "ACTIVO" && (
                        <Badge variant="secondary">{negocio.status.toLowerCase()}</Badge>
                      )}
                      <Badge variant={sub?.status === "ACTIVA" ? "default" : "secondary"}>
                        {sub ? (ESTADO_LICENCIA[sub.status] ?? sub.status) : "sin suscripción"}
                      </Badge>
                    </span>
                  </div>

                  <p className="text-muted-foreground text-xs">
                    {negocio._count.memberships} personas · {negocio._count.tables} mesas ·{" "}
                    {negocio._count.products} productos · {negocio._count.orders} pedidos
                    {dias !== null &&
                      ` · ${dias > 0 ? `${dias} días de servicio` : "servicio cortado"}`}
                  </p>

                  <AccionesNegocio
                    businessId={negocio.id}
                    suspendido={negocio.status !== "ACTIVO"}
                  />
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Indicador({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: string | number;
  detalle?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-muted-foreground text-sm">{titulo}</p>
        <p className="numeral text-2xl font-semibold">{valor}</p>
        {detalle && <p className="text-muted-foreground text-xs">{detalle}</p>}
      </CardContent>
    </Card>
  );
}
