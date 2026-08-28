import type { Metadata } from "next";
import { EncabezadoPantalla } from "@/components/marca/pantalla";
import {
  getCuentas,
  getResumenPlataforma,
  getWebhooksConError,
} from "@/features/superadmin/queries";
import { Card, CardContent } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/dal";
import { formatCop } from "@/lib/money";
import { listaVigenteDeLaBase } from "@/lib/billing/lista";
import { formatBusinessDate } from "@/lib/time";
import { TablaCuentas } from "./tabla-cuentas";

export const metadata: Metadata = { title: "Cuentas" };
export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  // Verifica por su cuenta: el layout no es frontera.
  await requireSuperAdmin();

  const [cuentas, resumen, webhooks, lista] = await Promise.all([
    getCuentas(),
    getResumenPlataforma(),
    getWebhooksConError(),
    // La lista vigente: sin ella la consola no puede decir cuánto paga cada
    // cuenta, solo el `priceCop` de la primera sede.
    listaVigenteDeLaBase(),
  ]);

  // Se derivan de las cuentas y no de un `count` sobre `business`: contar
  // negocios inflaba los indicadores con cada sucursal, que es el mismo error
  // que hacía aparecer a un dueño con dos locales como dos clientes.
  const sedes = cuentas.reduce((total, c) => total + c.sedes.length, 0);
  const conLicenciaViva = cuentas.filter((c) =>
    ["ACTIVA", "PRUEBA"].includes(c.principal.subscription?.status ?? ""),
  ).length;

  return (
    <div className="space-y-6">
      <EncabezadoPantalla
        titulo="Consola de Cuentas"
        descripcion="Gestión inteligente de clientes, licencias y estado operacional de la plataforma."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Indicador
          titulo="Cuentas"
          valor={cuentas.length}
          detalle={`${sedes} ${sedes === 1 ? "sede" : "sedes"} en total`}
        />
        <Indicador titulo="Con Licencia Activa" valor={conLicenciaViva} />
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
            <h2 className="rotulo-seccion flex items-center gap-2 text-destructive-soft">
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

      {/* Tabla e Interfaz Interactiva de Cuentas */}
      <TablaCuentas cuentas={cuentas} lista={lista} />
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
