import type { Metadata } from "next";
import Link from "next/link";
import { AppModule } from "@/generated/prisma/enums";
import {
  getAnulaciones,
  getPorMetodoDePago,
  getPorTarifa,
  getProductosMasVendidos,
  getResumenDeJornada,
} from "@/features/informes/queries";
import { getSettings } from "@/features/negocio/queries";
import { Card, CardContent } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/dal";
import { formatCop, formatRateBp, promedioCop, variacionPorcentual } from "@/lib/money";
import { currentBusinessDate, formatBusinessDate, parseBusinessDate } from "@/lib/time";

export const metadata: Metadata = { title: "Informes" };
export const dynamic = "force-dynamic";

const METODO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "Tarjeta débito",
  TARJETA_CREDITO: "Tarjeta crédito",
  NEQUI: "Nequi",
  DAVIPLATA: "Daviplata",
  TRANSFERENCIA: "Transferencia",
  BONO: "Bono",
  OTRO: "Otro",
};

const DIA_MS = 86_400_000;

export default async function InformesPage({
  searchParams,
}: {
  searchParams: Promise<{ jornada?: string }>;
}) {
  const ctx = await requireModule(AppModule.INFORMES);
  const { jornada } = await searchParams;
  const settings = await getSettings(ctx.business.id);

  // Una jornada mal escrita en la URL no puede tumbar la página: se cae al día
  // en curso, que es lo que la persona quería ver.
  let dia: Date;
  try {
    dia = jornada ? parseBusinessDate(jornada) : currentBusinessDate(settings);
  } catch {
    dia = currentBusinessDate(settings);
  }

  const anterior = new Date(dia.getTime() - DIA_MS);
  const hoy = currentBusinessDate(settings);

  const [resumen, resumenAnterior, porMetodo, porTarifa, top, anulaciones] = await Promise.all([
    getResumenDeJornada(ctx.business.id, dia),
    getResumenDeJornada(ctx.business.id, anterior),
    getPorMetodoDePago(ctx.business.id, dia),
    getPorTarifa(ctx.business.id, dia),
    getProductosMasVendidos(ctx.business.id, dia),
    getAnulaciones(ctx.business.id, dia),
  ]);

  const variacion = variacionPorcentual(resumen.ventasCop, resumenAnterior.ventasCop);
  const ticket = promedioCop(resumen.ventasCop, resumen.pedidos);
  const esHoy = dia.getTime() === hoy.getTime();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Informes</h1>
          <p className="text-muted-foreground text-sm">
            Jornada del <span className="numeral">{formatBusinessDate(dia)}</span>
            {esHoy && " · en curso"}
          </p>
        </div>

        {/* La jornada empieza a las {corte}, no a medianoche: lo vendido en la
            madrugada cuenta para el día anterior. */}
        <nav className="flex items-center gap-3 text-sm">
          <Link
            href={`/informes?jornada=${formatBusinessDate(anterior)}`}
            className="text-primary hover:underline"
          >
            ← Día anterior
          </Link>
          {!esHoy && (
            <Link href="/informes" className="text-primary hover:underline">
              Hoy
            </Link>
          )}
        </nav>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          titulo="Ventas"
          valor={formatCop(resumen.ventasCop)}
          detalle={
            variacion === null
              ? "sin ventas el día anterior"
              : `${variacion >= 0 ? "+" : ""}${variacion}% vs. día anterior`
          }
        />
        <Indicador titulo="Pedidos" valor={resumen.pedidos} />
        <Indicador titulo="Ticket promedio" valor={formatCop(ticket)} />
        <Indicador
          titulo="Propinas"
          valor={formatCop(resumen.propinasCop)}
          detalle="no son ingreso del negocio"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-medium">Cómo pagaron</h2>
            {porMetodo.length === 0 ? (
              <Vacio />
            ) : (
              <ul className="divide-border divide-y text-sm">
                {porMetodo.map((m) => (
                  <li key={m.method} className="flex justify-between gap-2 py-2 first:pt-0">
                    <span>
                      {METODO[m.method] ?? m.method}
                      <span className="text-muted-foreground ml-2 text-xs">
                        {m.cantidad} {m.cantidad === 1 ? "cobro" : "cobros"}
                      </span>
                    </span>
                    <span className="numeral font-medium">{formatCop(m.totalCop)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-medium">Impuesto por tarifa</h2>
            {porTarifa.length === 0 ? (
              <Vacio />
            ) : (
              <ul className="divide-border divide-y text-sm">
                {porTarifa.map((t) => (
                  <li key={`${t.nombre}-${t.rateBp}`} className="space-y-0.5 py-2 first:pt-0">
                    <div className="flex justify-between gap-2">
                      <span>
                        {t.nombre}{" "}
                        <span className="text-muted-foreground text-xs">
                          {formatRateBp(t.rateBp)}
                        </span>
                      </span>
                      <span className="numeral font-medium">{formatCop(t.impuestoCop)}</span>
                    </div>
                    <div className="text-muted-foreground flex justify-between gap-2 text-xs">
                      <span>base gravable</span>
                      <span className="numeral">{formatCop(t.baseCop)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-medium">Lo más vendido</h2>
          {top.length === 0 ? (
            <Vacio />
          ) : (
            <ul className="divide-border divide-y text-sm">
              {top.map((p) => (
                <li key={p.nombre} className="flex justify-between gap-2 py-2 first:pt-0">
                  <span>
                    <span className="numeral text-muted-foreground mr-2">{p.unidades}</span>
                    {p.nombre}
                  </span>
                  <span className="numeral font-medium">{formatCop(p.totalCop)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {(anulaciones.renglones.length > 0 || anulaciones.pedidosAnulados > 0) && (
        <Card>
          <CardContent className="space-y-3">
            <h2 className="font-medium">Anulaciones</h2>
            <p className="text-muted-foreground text-xs">
              {anulaciones.pedidosAnulados > 0 &&
                `${anulaciones.pedidosAnulados} ${anulaciones.pedidosAnulados === 1 ? "pedido anulado" : "pedidos anulados"}. `}
              Quedan registradas con quién y por qué.
            </p>
            <ul className="divide-border divide-y text-sm">
              {anulaciones.renglones.map((r) => (
                <li key={r.id} className="space-y-0.5 py-2 first:pt-0">
                  <div className="flex justify-between gap-2">
                    <span>
                      <span className="numeral text-muted-foreground mr-2">{r.quantity}</span>
                      {r.nameSnapshot}
                      <span className="text-muted-foreground ml-2 text-xs">
                        pedido {r.order.code}
                      </span>
                    </span>
                    <span className="numeral">{formatCop(r.lineTotalCop)}</span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {r.canceledReason}
                    {r.canceledBy && ` · ${r.canceledBy.name}`}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
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

function Vacio() {
  return <p className="text-muted-foreground text-sm">No hubo movimiento en esta jornada.</p>;
}
