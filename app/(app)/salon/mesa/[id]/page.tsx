import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Layers, PlusCircle, Users, UtensilsCrossed } from "lucide-react";
import { AppModule } from "@/generated/prisma/enums";
import { getMesa } from "@/features/salon/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CerrarSinConsumo } from "@/features/pedidos/components/cerrar-sin-consumo";
import { requireModule } from "@/lib/auth/dal";
import { formatCop } from "@/lib/money";
import { LiberarMesa, NuevaCuenta, RenombrarCuenta } from "./acciones";

export const metadata: Metadata = { title: "Mesa · Platlia" };
export const dynamic = "force-dynamic";

const ESTADO_CUENTA: Record<string, string> = {
  ABIERTA: "Abierta",
  CUENTA_PEDIDA: "Cuenta pedida",
};

/**
 * Las cuentas de una mesa.
 *
 * Permite gestionar múltiples cuentas independientes en la misma mesa física:
 * cada cuenta envía su propia comanda a cocina y se factura por separado.
 */
export default async function MesaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireModule(AppModule.MESAS);

  const mesa = await getMesa(ctx.business.id, id);
  if (!mesa) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      {/* ─── Encabezado y Navegación ─── */}
      <div className="space-y-3 border-b border-dashed border-border/80 pb-5">
        <Link
          href="/salon"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>Ir al salón</span>
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="font-display font-black uppercase tracking-tight text-foreground text-3xl sm:text-4xl">
                Mesa {mesa.name}
              </h1>
              <Badge variant="outline" className="text-rotulo font-bold uppercase tracking-wider">
                {mesa.area ? mesa.area.name : "Salón"}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground font-sans">
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5 text-muted-foreground" />
                {mesa.capacity} puestos
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <Layers className="size-3.5 text-brand" />
                {mesa.cuentas.length}{" "}
                {mesa.cuentas.length === 1 ? "cuenta activa" : "cuentas activas"}
              </span>
            </div>
          </div>

          {mesa.totalCop > 0 && (
            <div className="text-right">
              <span className="block text-rotulo font-bold uppercase tracking-wider text-muted-foreground">
                Total mesa
              </span>
              <span className="numeral font-display text-2xl font-black text-brand">
                {formatCop(mesa.totalCop)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Cuentas de la Mesa ─── */}
      {mesa.cuentas.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-border p-8 text-center shadow-xs">
          <CardContent className="space-y-2">
            <UtensilsCrossed className="size-8 mx-auto text-muted-foreground/60" />
            <h3 className="font-semibold text-sm text-foreground">Esta mesa está libre</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No hay pedidos abiertos en este momento. Abrí la primera cuenta a continuación para comenzar a tomar el pedido.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {mesa.cuentas.map((cuenta, indice) => (
            <Card key={cuenta.id} className="rounded-2xl border-border/80 shadow-xs flex flex-col justify-between overflow-hidden">
              <CardContent className="p-4 flex flex-col justify-between h-full space-y-3.5">
                {/* Cabecera Cuenta */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="numeral bg-brand/10 text-brand flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-black">
                        {indice + 1}
                      </span>
                      <span className="text-sm font-bold text-foreground leading-tight">
                        {cuenta.etiqueta}
                      </span>
                    </div>

                    {cuenta.status === "CUENTA_PEDIDA" && (
                      <Badge variant="outline" className="text-rotulo font-bold bg-warning/10 text-warning-soft border-warning/30">
                        {ESTADO_CUENTA[cuenta.status]}
                      </Badge>
                    )}
                  </div>

                  <p className="text-muted-foreground text-xs">
                    {cuenta.renglones === 0
                      ? "Sin productos agregados"
                      : `${cuenta.renglones} ${cuenta.renglones === 1 ? "producto" : "productos"}`}
                    {" · "}
                    <span className="font-medium text-foreground">{cuenta.abrioPor}</span>
                  </p>

                  <div className="pt-1">
                    <span className="numeral text-xl font-black text-foreground">
                      {formatCop(cuenta.totalCop)}
                    </span>
                  </div>
                </div>

                {/* Acciones de la Cuenta */}
                <div className="space-y-2.5 pt-2 border-t border-border/60">
                  <RenombrarCuenta orderId={cuenta.id} customerName={cuenta.customerName} />

                  <Link
                    href={`/pedido/${cuenta.id}`}
                    className="bg-brand text-brand-foreground hover:bg-brand/90 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors shadow-xs"
                  >
                    <PlusCircle className="size-3.5" />
                    <span>Tomar pedido / Adición</span>
                  </Link>

                  {cuenta.renglones === 0 && <CerrarSinConsumo orderId={cuenta.id} />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Formulario para Abrir Cuenta Adicional ─── */}
      <Card className="rounded-2xl border-border/80 shadow-xs">
        <CardContent className="p-5 space-y-3.5">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-foreground">
              {mesa.cuentas.length === 0 ? "Abrir primera cuenta" : "Abrir cuenta adicional en esta mesa"}
            </h2>
            <p className="text-muted-foreground text-xs">
              Permite tomar pedidos separados para comensales en la misma mesa. Cada cuenta genera su propia comanda y recibo.
            </p>
          </div>
          <NuevaCuenta tableId={mesa.id} />
        </CardContent>
      </Card>

      {/* ─── Liberar Mesa sin Consumo ─── */}
      {mesa.sinConsumo && (
        <Card className="border-dashed rounded-2xl">
          <CardContent className="p-4 space-y-2 text-xs">
            <p className="text-muted-foreground">
              {mesa.cuentas.length === 1
                ? "Esta cuenta no registra ningún producto."
                : "Ninguna de las cuentas tiene productos pedidos."}{" "}
              Podés cerrar todo y dejar la mesa libre para nuevos clientes.
            </p>
            <LiberarMesa tableId={mesa.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
