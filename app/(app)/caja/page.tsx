import type { Metadata } from "next";
import { AppModule } from "@/generated/prisma/enums";
import {
  getCajaAbierta,
  getMovimientos,
  getResumenCaja,
  getUltimoCierre,
} from "@/features/caja/queries";
import { Card, CardContent } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/dal";
import { tenantDb } from "@/lib/db/tenant";
import { formatCop } from "@/lib/money";
import { formatDateTimeInTimeZone } from "@/lib/time";
import { cn } from "@/lib/utils";
import { AbrirCaja, CerrarCaja, Movimiento } from "./formularios";

export const metadata: Metadata = { title: "Caja" };
export const dynamic = "force-dynamic";

const TIPO: Record<string, string> = {
  INGRESO: "Entrada",
  EGRESO: "Gasto",
  RETIRO: "Retiro",
  AJUSTE: "Ajuste",
};

export default async function CajaPage() {
  const ctx = await requireModule(AppModule.CAJA);
  const caja = await getCajaAbierta(ctx.business.id);

  if (!caja) {
    const ultimo = await getUltimoCierre(ctx.business.id);

    return (
      <div className="mx-auto max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Caja</h1>
          <p className="text-muted-foreground text-sm">
            No hay ningún turno abierto. Abrí la caja para empezar a cobrar.
          </p>
        </div>

        {ultimo && (
          <Card>
            <CardContent className="space-y-2">
              <h2 className="font-medium">Caja cerrada</h2>
              <p className="text-muted-foreground text-xs">
                Turno {ultimo.code} · cerró {ultimo.closedBy?.name ?? "—"}
                {ultimo.closedAt &&
                  ` · ${formatDateTimeInTimeZone(ultimo.closedAt, ctx.business.timeZone)}`}
              </p>
              <dl className="space-y-1 text-sm">
                <Fila termino="Esperado" valor={ultimo.expectedCashCop ?? 0} />
                <Fila termino="Contado" valor={ultimo.countedCashCop ?? 0} />
                <div className="border-border flex items-baseline justify-between border-t pt-2">
                  <dt className="font-medium">Diferencia</dt>
                  <dd
                    className={cn(
                      "numeral text-lg font-semibold",
                      (ultimo.differenceCop ?? 0) !== 0 && "text-destructive",
                    )}
                  >
                    {formatCop(ultimo.differenceCop ?? 0)}
                  </dd>
                </div>
              </dl>
              {ultimo.notes && (
                <p className="text-muted-foreground text-xs italic">{ultimo.notes}</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <AbrirCaja />
          </CardContent>
        </Card>
      </div>
    );
  }

  const db = tenantDb(ctx.business.id);
  const [resumen, movimientos] = await Promise.all([
    getResumenCaja(db, caja.id),
    getMovimientos(ctx.business.id, caja.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Caja {caja.code}</h1>
        <p className="text-muted-foreground text-sm">
          Abierta por {caja.openedBy.name} ·{" "}
          {formatDateTimeInTimeZone(caja.openedAt, ctx.business.timeZone)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3">
              <h2 className="font-medium">Lo que debería haber en el cajón</h2>
              <dl className="space-y-1 text-sm">
                <Fila termino="Base del turno" valor={resumen.openingFloatCop} />
                <Fila termino="Ventas en efectivo" valor={resumen.efectivoVentasCop} />
                <Fila termino="Entradas y ajustes" valor={resumen.ingresosCop} />
                <Fila termino="Gastos y retiros" valor={-resumen.egresosCop} />
                <div className="border-border flex items-baseline justify-between border-t pt-2">
                  <dt className="font-medium">Esperado en efectivo</dt>
                  <dd className="numeral text-2xl font-semibold">
                    {formatCop(resumen.esperadoCop)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {resumen.porMetodo.length > 0 && (
            <Card>
              <CardContent className="space-y-3">
                <h2 className="font-medium">Cobros del turno</h2>
                <ul className="divide-border divide-y text-sm">
                  {resumen.porMetodo.map((metodo) => (
                    <li
                      key={metodo.method}
                      className="flex items-center justify-between gap-2 py-1.5 first:pt-0"
                    >
                      <span>
                        {metodo.method}
                        <span className="text-muted-foreground ml-2 text-xs">
                          {metodo.cantidad} {metodo.cantidad === 1 ? "cobro" : "cobros"}
                        </span>
                      </span>
                      <span className="numeral font-medium">{formatCop(metodo.totalCop)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-4">
              <h2 className="font-medium">Entradas y salidas</h2>
              <Movimiento />

              {movimientos.length > 0 && (
                <ul className="divide-border divide-y border-t text-sm">
                  {movimientos.map((mov) => (
                    <li key={mov.id} className="flex items-start justify-between gap-3 py-2">
                      <span>
                        <span className="text-muted-foreground text-xs">{TIPO[mov.type]}</span>
                        <br />
                        {mov.concept}
                      </span>
                      <span className="numeral whitespace-nowrap">
                        {formatCop(mov.amountCop)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardContent className="space-y-3">
              <h2 className="font-medium">Cerrar el turno</h2>
              <CerrarCaja esperadoCop={resumen.esperadoCop} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Fila({ termino, valor }: { termino: string; valor: number }) {
  return (
    <div className="text-muted-foreground flex justify-between gap-2">
      <dt>{termino}</dt>
      <dd className="numeral">{formatCop(valor)}</dd>
    </div>
  );
}
