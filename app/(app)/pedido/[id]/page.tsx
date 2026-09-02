import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { AppModule, Role } from "@/generated/prisma/enums";
import { getCajasDisponibles, getSesionDeTrabajo } from "@/features/caja/queries";
import { getCarta, getPedido, getPedidosAbiertos } from "@/features/pedidos/queries";
import { CerrarSinConsumo } from "@/features/pedidos/components/cerrar-sin-consumo";
import { TrasladarCuenta } from "@/features/pedidos/components/trasladar";
import { getMesasParaTraslado } from "@/features/salon/queries";
import { getSettings } from "@/features/negocio/queries";
import { ModuloPosInteractive } from "@/app/(app)/pos/modulo-pos-interactive";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { puedeFacturarElectronicamente } from "@/lib/billing/factus-habilitacion";
import { plataformaFacturaConfigurada } from "@/lib/billing/factus-plataforma";
import { requireModule, tieneRol } from "@/lib/auth/dal";
import { formatCop } from "@/lib/money";
import { formatTurno } from "@/lib/turns";
import { Carta } from "./carta";
import { CuentaMovil } from "./cuenta-movil";
import {
  CuentaEnVivo,
  ListaDeRenglones,
  SegunConsumo,
  TotalesEnVivo,
} from "./cuenta-en-vivo";
import { AnularPedido, ConfirmarPedido } from "./acciones";

export const metadata: Metadata = { title: "Pedido · Platlia" };
export const dynamic = "force-dynamic";

const ESTADO: Record<string, string> = {
  ABIERTA: "Abierta",
  CUENTA_PEDIDA: "Cuenta pedida",
  PAGADA: "Pagada",
  ANULADA: "Anulada",
};

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireModule(AppModule.PEDIDOS);

  const [pedido, carta, settings] = await Promise.all([
    getPedido(ctx.business.id, id),
    getCarta(ctx.business.id),
    getSettings(ctx.business.id),
  ]);

  if (!pedido) notFound();

  const usaMesas = ctx.modules.has(AppModule.MESAS);

  // Si no es pedido de salón o el módulo de mesas no está activo, usar vista POS mostrador
  if (pedido.type !== "MESA" || !usaMesas) {
    const [trabajo, cajasDisponibles, pedidos] = await Promise.all([
      getSesionDeTrabajo(ctx.business.id, ctx.user.id),
      getCajasDisponibles(ctx.business.id),
      getPedidosAbiertos(ctx.business.id),
    ]);

    return (
      <ModuloPosInteractive
        carta={carta}
        caja={trabajo.sesion}
        cajasDisponibles={cajasDisponibles}
        pedidosAbiertos={pedidos}
        pedidoInicial={pedido}
        puedeFacturar={puedeFacturarElectronicamente(settings, plataformaFacturaConfigurada())}
        usaMesas={usaMesas}
        settings={{
          inventoryEnabled: settings.inventoryEnabled,
          permitirVentaSinStock: settings.permitirVentaSinStock,
          deliveryEnabled: settings.deliveryEnabled,
          deliveryFeeCop: settings.deliveryFeeCop,
          requireOpenCashSession: settings.requireOpenCashSession,
          cashRoundingCop: settings.cashRoundingCop,
          pricesIncludeTax: settings.pricesIncludeTax,
          tipSuggestionEnabled: settings.tipSuggestionEnabled,
          tipSuggestionRateBp: settings.tipSuggestionRateBp,
        }}
      />
    );
  }

  const editable = pedido.status === "ABIERTA" || pedido.status === "CUENTA_PEDIDA";
  const renglones = pedido.items.filter((i) => i.status !== "ANULADO");
  const itemsSinEnviarCount = pedido.items.filter(
    (i) => i.status === "PENDIENTE" && i.sentToKitchenAt === null,
  ).length;
  const nombreDeCuenta = pedido.customerName?.trim() || null;
  const puedeCobrar = tieneRol(ctx.role, [Role.CAJERO, Role.ADMINISTRADOR]);

  // Las mesas a las que se puede mudar esta cuenta. Se consulta solo en la rama
  // de mesa: en el mostrador no hay a dónde trasladar nada.
  const mesasDestino = editable
    ? await getMesasParaTraslado(ctx.business.id, pedido.table?.id ?? null)
    : [];

  const panelCuenta = (
    <div className="space-y-4">
      {/* Botón principal de comanda a cocina */}
      {editable && (
        <SegunConsumo
          conConsumo={
            <ConfirmarPedido
              orderId={pedido.id}
              turnNumber={pedido.turnNumber}
              isMesa={pedido.type === "MESA"}
              itemsSinEnviarCount={itemsSinEnviarCount}
            />
          }
        />
      )}

      {/* Lista de productos y totales de la cuenta */}
      <Card className="rounded-2xl border-border/80 shadow-xs">
        <CardContent className="p-4 space-y-3.5">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Comanda del pedido
            </h2>
            <span className="text-rotulo font-mono text-muted-foreground">
              {renglones.reduce((acc, r) => acc + r.quantity, 0)} ítems
            </span>
          </div>

          <ListaDeRenglones editable={editable} puedeCobrar={puedeCobrar} />
          <TotalesEnVivo />
        </CardContent>
      </Card>

      {/* Acá vivía "Pedir la cuenta (Enviar a caja)", y se fue.
          Desde que la caja lista todo lo que salió a cocina, mandarla era un
          trámite sin efecto: la cuenta ya estaba del otro lado desde que el
          mesero cantó la comanda. Un botón que no cambia nada enseña a tocar
          botones que no cambian nada.
          Con él se fue el selector de propina de esta pantalla: la propina se
          pregunta donde está la persona que paga, y eso es la caja. El comensal
          que pide por QR sigue eligiéndola él mismo, y el POS de mostrador
          también, porque ahí quien atiende Y cobra es la misma persona. */}

      {/* Trasladar la cuenta a otra mesa.
          Va acá y no solo en la pantalla de la mesa porque este es el lugar donde
          está parado el mesero cuando el comensal le dice que se cambia: con la
          cuenta abierta delante. */}
      {editable && usaMesas && mesasDestino.length > 0 && (
        <Card className="rounded-2xl border-border/80">
          <CardContent className="p-3">
            <TrasladarCuenta orderId={pedido.id} mesas={mesasDestino} />
          </CardContent>
        </Card>
      )}

      {/* Anulación o Cierre sin consumo */}
      {editable && (
        <SegunConsumo
          conConsumo={
            puedeCobrar ? (
              <Card className="rounded-2xl border-border/80">
                <CardContent className="p-3">
                  <AnularPedido orderId={pedido.id} vacio={false} esMesa={pedido.type === "MESA"} />
                </CardContent>
              </Card>
            ) : null
          }
          sinConsumo={
            <Card className="border-dashed rounded-2xl">
              <CardContent className="p-3.5 space-y-2.5">
                <p className="text-muted-foreground text-xs">
                  {pedido.type === "MESA"
                    ? "Esta cuenta no registra productos pedidos."
                    : "Este pedido quedó sin productos."}
                </p>
                <CerrarSinConsumo orderId={pedido.id} />
              </CardContent>
            </Card>
          }
        />
      )}

      {/* Historial de pagos si los hay */}
      {pedido.payments.length > 0 && (
        <Card className="rounded-2xl border-border/80 shadow-xs">
          <CardContent className="p-4 space-y-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Pagos registrados
            </h2>
            <ul className="space-y-1.5 text-xs divide-y divide-border/40">
              {pedido.payments.map((pago) => (
                <li key={pago.id} className="pt-1.5 first:pt-0 space-y-0.5">
                  <div className="flex justify-between font-medium">
                    <span className="text-foreground">{pago.method}</span>
                    <span className="numeral font-bold">{formatCop(pago.amountCop)}</span>
                  </div>
                  {pago.changeCop !== null && pago.changeCop > 0 && (
                    <div className="text-muted-foreground flex justify-between text-rotulo">
                      <span>
                        Recibido <span className="numeral">{formatCop(pago.tenderedCop ?? 0)}</span>
                      </span>
                      <span>
                        Devuelta: <strong className="numeral text-foreground font-bold">{formatCop(pago.changeCop)}</strong>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ─── Encabezado del Pedido ─── */}
      <div className="space-y-3 border-b border-dashed border-border/80 pb-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Link
            href={pedido.table ? `/salon/mesa/${pedido.table.id}` : usaMesas ? "/salon" : "/pos"}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>
              {pedido.table
                ? `Tomar otro pedido (Mesa ${pedido.table.name})`
                : usaMesas
                  ? "Ir al salón"
                  : "Volver al POS"}
            </span>
          </Link>

          {(puedeCobrar || pedido.type !== "MESA" || pedido.status === "PAGADA") && (
            <a
              href={`/imprimir/pedido/${pedido.id}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-xl px-3 py-1.5 transition-colors shadow-xs bg-card"
            >
              <Printer className="size-3.5" />
              <span>Imprimir cuenta</span>
            </a>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-display font-black uppercase tracking-tight text-foreground text-3xl sm:text-4xl leading-none">
                {pedido.table ? `Mesa ${pedido.table.name}` : `Pedido #${pedido.code}`}
              </h1>
              {nombreDeCuenta && (
                <span className="text-muted-foreground text-xl sm:text-2xl font-bold">
                  · {nombreDeCuenta}
                </span>
              )}
              <Badge
                variant="outline"
                className="text-rotulo font-bold uppercase tracking-wider"
              >
                {ESTADO[pedido.status]}
              </Badge>
            </div>

            <p className="text-muted-foreground text-xs font-sans">
              Pedido #{pedido.code}
              {pedido.turnNumber !== null && (
                <span className="font-bold text-foreground font-mono">
                  {" · Turno "}
                  {formatTurno(pedido.turnNumber, 99, pedido.type === "MESA")}
                </span>
              )}
              {pedido.guestsCount ? ` · ${pedido.guestsCount} personas` : ""}
              {" · Abierto por "}
              <span className="font-medium text-foreground">{pedido.openedBy.name}</span>
            </p>
          </div>
        </div>
      </div>

      {pedido.status === "ANULADA" && pedido.canceledReason && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3.5 text-xs text-destructive">
            <strong>Pedido anulado:</strong> {pedido.canceledReason}
          </CardContent>
        </Card>
      )}

      {/* ─── Carta a la izquierda y Cuenta a la derecha ─── */}
      <CuentaEnVivo
        renglones={renglones}
        totales={{
          subtotalCop: pedido.subtotalCop,
          taxCop: pedido.taxCop,
          tipCop: pedido.tipCop,
          deliveryFeeCop: pedido.deliveryFeeCop,
          totalCop: pedido.totalCop,
          paidCop: pedido.paidCop,
        }}
        pricesIncludeTax={settings.pricesIncludeTax}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <section aria-label="Carta de productos">
            <Carta
              orderId={pedido.id}
              categorias={carta}
              editable={editable}
              inventoryEnabled={settings.inventoryEnabled}
              permitirVentaSinStock={settings.permitirVentaSinStock}
            />
          </section>

          <aside
            aria-label="Resumen de la cuenta"
            className="hidden space-y-4 lg:block lg:sticky lg:top-20 lg:self-start"
          >
            {panelCuenta}
          </aside>
        </div>

        <CuentaMovil
          titulo={
            pedido.table
              ? `Mesa ${pedido.table.name}${nombreDeCuenta ? ` · ${nombreDeCuenta}` : ""}`
              : `Pedido #${pedido.code}`
          }
        >
          {panelCuenta}
        </CuentaMovil>
      </CuentaEnVivo>
    </div>
  );
}
