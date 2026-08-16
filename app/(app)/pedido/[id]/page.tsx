import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppModule, Role } from "@/generated/prisma/enums";
import { getCajaAbierta } from "@/features/caja/queries";
import { getCarta, getPedido, getPedidosAbiertos } from "@/features/pedidos/queries";
import { CerrarSinConsumo } from "@/features/pedidos/components/cerrar-sin-consumo";
import { getSettings } from "@/features/negocio/queries";
import { ModuloPosInteractive } from "@/app/(app)/pos/modulo-pos-interactive";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { puedeFacturarElectronicamente } from "@/lib/billing/factus-habilitacion";
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
import { AnularPedido, Cobrar, ConfirmarPedido, PedirCuenta } from "./acciones";

export const metadata: Metadata = { title: "Pedido" };
export const dynamic = "force-dynamic";

const ESTADO: Record<string, string> = {
  ABIERTA: "Abierta",
  CUENTA_PEDIDA: "Cuenta pedida",
  PAGADA: "Pagada",
  ANULADA: "Anulada",
};

// En Next 15 params es una Promise.
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

  // El pedido se busca con el cliente acotado a la empresa, así que un id de otro
  // negocio no aparece: es un 404 igual que uno inexistente.
  if (!pedido) notFound();

  const usaMesas = ctx.modules.has(AppModule.MESAS);

  if (pedido.type !== "MESA" || !usaMesas) {
    const [caja, pedidos] = await Promise.all([
      getCajaAbierta(ctx.business.id),
      getPedidosAbiertos(ctx.business.id),
    ]);

    return (
      <ModuloPosInteractive
        carta={carta}
        caja={caja}
        pedidosAbiertos={pedidos}
        pedidoInicial={pedido}
        puedeFacturar={puedeFacturarElectronicamente(settings)}
        settings={{
          deliveryEnabled: settings.deliveryEnabled,
          requireOpenCashSession: settings.requireOpenCashSession,
          cashRoundingCop: settings.cashRoundingCop,
          pricesIncludeTax: settings.pricesIncludeTax,
        }}
      />
    );
  }

  const editable = pedido.status === "ABIERTA" || pedido.status === "CUENTA_PEDIDA";
  const renglones = pedido.items.filter((i) => i.status !== "ANULADO");
  const faltanteCop = Math.max(0, pedido.totalCop - pedido.paidCop);
  const nombreDeCuenta = pedido.customerName?.trim() || null;
  // El mesero canta y ajusta la mesa, pero no factura: anularItem, anularPedido
  // y registrarPago ya lo exigen en el servidor. Ofrecerle acá el botón sería
  // una trampa que siempre falla.
  const puedeCobrar = tieneRol(ctx.role, [Role.CAJERO, Role.ADMINISTRADOR]);

  // El mismo panel se pinta en la columna lateral (pantalla grande) y dentro
  // de la hoja que se abre desde la barra de abajo (celular). Se declara una
  // sola vez: dos copias divergen al primer cambio.
  const panelCuenta = (
    <>
      {/* Estas tarjetas dependen de si hay consumo, y con la cuenta en vivo eso
          cambia con el toque y no con la vuelta del servidor: la decisión la toma
          el cliente contando también el renglón que se acaba de anticipar. */}
      {editable && (
        <SegunConsumo
          conConsumo={
            <ConfirmarPedido
              orderId={pedido.id}
              turnNumber={pedido.turnNumber}
              isMesa={pedido.type === "MESA"}
            />
          }
        />
      )}
      <Card>
        <CardContent className="space-y-4">
          <h2 className="font-medium">La cuenta</h2>
          <ListaDeRenglones editable={editable} puedeCobrar={puedeCobrar} />
          <TotalesEnVivo />
        </CardContent>
      </Card>

      {/* Botón para imprimir ticket con el turno asignado */}
      <a
        href={`/imprimir/pedido/${pedido.id}`}
        target="_blank"
        rel="noopener"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent transition-all shadow-sm"
      >
        🖨️ Imprimir ticket {pedido.turnNumber !== null ? `(Turno ${formatTurno(pedido.turnNumber, 99, pedido.type === "MESA")})` : ""}
      </a>

      {pedido.status === "ABIERTA" && pedido.type === "MESA" && (
        <SegunConsumo conConsumo={<PedirCuenta orderId={pedido.id} esMesa={true} />} />
      )}

      {/* En modo POS (pedido rápido), se permite facturar/cobrar directamente sin enviar a caja */}
      {editable && pedido.type !== "MESA" && (
        <SegunConsumo
          conConsumo={
            <Card className="border-success/30 bg-success/5">
              <CardContent className="pt-4 space-y-3">
                <h2 className="font-semibold text-sm text-success-soft">
                  💳 Facturar y cobrar pedido (POS)
                </h2>
                <Cobrar orderId={pedido.id} faltanteCop={faltanteCop} />
              </CardContent>
            </Card>
          }
        />
      )}

      {editable && (
        <SegunConsumo
          conConsumo={
            puedeCobrar ? (
              <Card>
                <CardContent>
                  <AnularPedido orderId={pedido.id} vacio={false} esMesa={pedido.type === "MESA"} />
                </CardContent>
              </Card>
            ) : null
          }
          // Una cuenta sin nada pedido no se cobra ni se anula con motivo: se
          // cierra. Lo puede hacer quien la abrió —el mesero incluido—, porque si
          // no, una mesa abierta por error se queda abierta hasta que aparezca un
          // cajero, y termina trancando el cierre del turno.
          sinConsumo={
            <Card className="border-dashed">
              <CardContent className="space-y-3">
                <p className="text-muted-foreground text-xs">
                  {pedido.type === "MESA"
                    ? "Nadie pidió nada en esta cuenta."
                    : "Este pedido quedó sin productos."}
                </p>
                <CerrarSinConsumo orderId={pedido.id} />
              </CardContent>
            </Card>
          }
        />
      )}



      {pedido.payments.length > 0 && (
        <Card>
          <CardContent className="space-y-2">
            <h2 className="font-medium">Pagos</h2>
            <ul className="space-y-2 text-sm">
              {pedido.payments.map((pago) => (
                <li key={pago.id} className="space-y-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{pago.method}</span>
                    <span className="numeral">{formatCop(pago.amountCop)}</span>
                  </div>
                  {/* El vuelto se pinta desde el pago guardado y no solo en el
                      aviso de la acción: al cobrarse, el pedido se cierra y la
                      tarjeta de cobro desaparece con su mensaje adentro. El
                      cajero se quedaba sin saber cuánto devolver. */}
                  {pago.changeCop !== null && pago.changeCop > 0 && (
                    <div className="text-muted-foreground flex justify-between gap-2 text-xs">
                      <span>
                        Recibí{" "}
                        <span className="numeral">{formatCop(pago.tenderedCop ?? 0)}</span> ·
                        vuelto
                      </span>
                      <span className="numeral text-foreground font-medium">
                        {formatCop(pago.changeCop)}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-[clamp(1.875rem,3vw,2.5rem)]">
              {pedido.table ? `Mesa ${pedido.table.name}` : `Pedido ${pedido.code}`}
            </h1>
            {/* De quién es esta cuenta. Una mesa puede tener varias abiertas a la
                vez, así que sin el nombre no se sabe cuál se está mirando. */}
            {nombreDeCuenta && (
              <span className="text-muted-foreground text-xl font-medium">
                · {nombreDeCuenta}
              </span>
            )}
            <Badge variant={pedido.status === "PAGADA" ? "secondary" : "default"}>
              {ESTADO[pedido.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Pedido {pedido.code}
            {pedido.turnNumber !== null && (
              <span className="font-semibold text-foreground">
                {" · Turno "}
                {formatTurno(pedido.turnNumber, 99, pedido.type === "MESA")}
              </span>
            )}
            {pedido.guestsCount ? ` · ${pedido.guestsCount} personas` : ""} · abrió{" "}
            {pedido.openedBy.name}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Ventana nueva: la impresión no puede sacar al cajero de la cuenta. */}
          <a
            href={`/imprimir/pedido/${pedido.id}`}
            target="_blank"
            rel="noopener"
            className="text-primary text-sm font-medium hover:underline"
          >
            Imprimir cuenta
          </a>
          {/* Se vuelve a la mesa, no al salón: es donde están las otras cuentas
              del mismo grupo y desde donde se abre una más. */}
          <Link
            href={pedido.table ? `/salon/mesa/${pedido.table.id}` : usaMesas ? "/salon" : "/pos"}
            className="text-primary text-sm font-medium hover:underline"
          >
            {pedido.table
              ? `← Mesa ${pedido.table.name}`
              : usaMesas
                ? "← Volver al salón"
                : "← Volver al POS"}
          </Link>
        </div>
      </div>

      {pedido.status === "ANULADA" && pedido.canceledReason && (
        <Card>
          <CardContent className="text-sm">
            <strong>Pedido anulado.</strong> {pedido.canceledReason}
          </CardContent>
        </Card>
      )}

      {/* La carta y la cuenta comparten estado: tocar un producto tiene que
          verse en la cuenta con el dedo todavía en la pantalla, sin esperar a
          que el servidor vuelva a armar la página entera. */}
      <CuentaEnVivo
        renglones={renglones}
        totales={{
          subtotalCop: pedido.subtotalCop,
          taxCop: pedido.taxCop,
          tipCop: pedido.tipCop,
          totalCop: pedido.totalCop,
          paidCop: pedido.paidCop,
        }}
        pricesIncludeTax={settings.pricesIncludeTax}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <section aria-label="Carta">
            <Carta orderId={pedido.id} categorias={carta} editable={editable} />
          </section>

          {/* Oculto en celular: ahí la cuenta vive en la hoja de CuentaMovil.
              Se oculta con CSS y no con una condición de JS porque el servidor
              no sabe el ancho de la pantalla. */}
          <aside
            aria-label="La cuenta"
            className="hidden space-y-4 lg:block lg:sticky lg:top-20 lg:self-start"
          >
            {panelCuenta}
          </aside>
        </div>

        <CuentaMovil
          titulo={
            pedido.table
              ? `Mesa ${pedido.table.name}${nombreDeCuenta ? ` · ${nombreDeCuenta}` : ""}`
              : `Pedido ${pedido.code}`
          }
        >
          {panelCuenta}
        </CuentaMovil>
      </CuentaEnVivo>
    </div>
  );
}
