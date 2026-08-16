import type { Metadata } from "next";
import {
  getNegocios,
  getResumenPlataforma,
  getWebhooksConError,
} from "@/features/superadmin/queries";
import { Card, CardContent } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/dal";
import { formatCop } from "@/lib/money";
import { formatBusinessDate } from "@/lib/time";
import { TablaNegocios } from "./tabla-negocios";

export const metadata: Metadata = { title: "Negocios" };
export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  // Verifica por su cuenta: el layout no es frontera.
  await requireSuperAdmin();

  const [negocios, resumen, webhooks] = await Promise.all([
    getNegocios(),
    getResumenPlataforma(),
    getWebhooksConError(),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-3xl">Consola de Negocios</h1>
        <p className="text-muted-foreground text-sm">
          Gestión inteligente de clientes, licencias y estado operacional de la plataforma.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Indicador titulo="Total Negocios" valor={resumen.negocios} />
        <Indicador titulo="Con Licencia Activa" valor={resumen.conLicenciaViva} />
        <Indicador titulo="Usuarios Registrados" valor={resumen.usuarios} />
        <Indicador
          titulo="Recaudado Total"
          valor={formatCop(resumen.recaudadoCop)}
          detalle={`${resumen.pagosAprobados} pagos aprobados`}
        />
      </div>

      {webhooks.length > 0 && (
        <Card className="border-destructive">
          <CardContent className="space-y-3">
            <h2 className="font-medium text-destructive flex items-center gap-2">
              <span>⚠️ Avisos de MercadoPago que fallaron</span>
            </h2>
            <p className="text-muted-foreground text-xs">
              Listado de eventos de webhook que requieren atención técnica.
            </p>
            <ul className="divide-border divide-y text-sm">
              {webhooks.map((w) => (
                <li key={w.id} className="space-y-0.5 py-2 first:pt-0">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-mono text-xs font-semibold">{w.mpEventId}</span>
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

      {/* Tabla e Interfaz Interactiva de Negocios */}
      <TablaNegocios negocios={negocios} />
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
      <CardContent className="space-y-1.5">
        <p className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
          {titulo}
        </p>
        <p className="numeral text-2xl font-semibold sm:text-3xl">{valor}</p>
        {detalle && <p className="text-muted-foreground text-xs">{detalle}</p>}
      </CardContent>
    </Card>
  );
}
