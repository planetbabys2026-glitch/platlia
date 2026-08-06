import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppModule, Role } from "@/generated/prisma/enums";
import { getCarta, getPedido } from "@/features/pedidos/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireModule, tieneRol } from "@/lib/auth/dal";
import { formatCop, formatRateBp } from "@/lib/money";
import { formatTurno } from "@/lib/turns";
import { Carta } from "./carta";
import {
  AnularPedido,
  AnularRenglon,
  ConfirmarPedido,
  ControlCantidad,
  NotaRenglon,
  PedirCuenta,
  QuitarRenglon,
} from "./acciones";

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

  const [pedido, carta] = await Promise.all([
    getPedido(ctx.business.id, id),
    getCarta(ctx.business.id),
  ]);

  // El pedido se busca con el cliente acotado a la empresa, así que un id de otro
  // negocio no aparece: es un 404 igual que uno inexistente.
  if (!pedido) notFound();

  // Sin mesas, /salon no existe: el mismo criterio que ya usa el shell de la
  // app para decidir entre "Salón" y "POS" en la barra de navegación.
  const usaMesas = ctx.modules.has(AppModule.MESAS);
  const editable = pedido.status === "ABIERTA" || pedido.status === "CUENTA_PEDIDA";
  const renglones = pedido.items.filter((i) => i.status !== "ANULADO");
  const faltanteCop = Math.max(0, pedido.totalCop - pedido.paidCop);
  // El mesero canta y ajusta la mesa, pero no factura: anularItem, anularPedido
  // y registrarPago ya lo exigen en el servidor. Ofrecerle acá el botón sería
  // una trampa que siempre falla.
  const puedeCobrar = tieneRol(ctx.role, [Role.CAJERO, Role.ADMINISTRADOR]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {pedido.table ? `Mesa ${pedido.table.name}` : `Pedido ${pedido.code}`}
            </h1>
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
          <Link
            href={usaMesas ? "/salon" : "/pos"}
            className="text-primary text-sm font-medium hover:underline"
          >
            {usaMesas ? "← Volver al salón" : "← Volver al POS"}
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

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section aria-label="Carta">
          <Carta orderId={pedido.id} categorias={carta} editable={editable} />
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {editable && renglones.length > 0 && (
            <ConfirmarPedido
              orderId={pedido.id}
              hasItems={renglones.length > 0}
              turnNumber={pedido.turnNumber}
              isMesa={pedido.type === "MESA"}
            />
          )}
          <Card>
            <CardContent className="space-y-4">
              <h2 className="font-medium">La cuenta</h2>

              {renglones.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Todavía no hay nada. Tocá un producto de la carta.
                </p>
              ) : (
                <ul className="divide-border divide-y">
                  {renglones.map((item) => (
                    <li key={item.id} className="space-y-1 py-2 first:pt-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm leading-tight">{item.nameSnapshot}</span>
                        <span className="numeral text-sm font-medium whitespace-nowrap">
                          {formatCop(item.lineTotalCop)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <ControlCantidad
                          itemId={item.id}
                          quantity={item.quantity}
                          editable={editable}
                        />
                        <span className="text-muted-foreground text-xs">
                          {formatCop(item.unitPriceCop)} c/u ·{" "}
                          {formatRateBp(item.taxRateBpSnapshot)}
                        </span>
                      </div>
                      {editable ? (
                        <NotaRenglon itemId={item.id} notes={item.notes} />
                      ) : (
                        item.notes && (
                          <p className="text-muted-foreground text-xs italic">{item.notes}</p>
                        )
                      )}
                      {editable &&
                        (item.status === "PENDIENTE" ? (
                          <QuitarRenglon itemId={item.id} />
                        ) : (
                          puedeCobrar && <AnularRenglon itemId={item.id} />
                        ))}
                    </li>
                  ))}
                </ul>
              )}

              <dl className="border-border space-y-1 border-t pt-3 text-sm">
                <Fila termino="Base gravable" valor={pedido.subtotalCop} />
                <Fila termino="Impuesto" valor={pedido.taxCop} />
                {pedido.tipCop > 0 && <Fila termino="Propina" valor={pedido.tipCop} />}
                <div className="flex items-baseline justify-between pt-1">
                  <dt className="font-medium">Total</dt>
                  <dd className="numeral text-2xl font-semibold">
                    {formatCop(pedido.totalCop)}
                  </dd>
                </div>
                {pedido.paidCop > 0 && (
                  <>
                    <Fila termino="Pagado" valor={pedido.paidCop} />
                    {faltanteCop > 0 && <Fila termino="Falta" valor={faltanteCop} />}
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          {pedido.status === "ABIERTA" && renglones.length > 0 && (
            <PedirCuenta orderId={pedido.id} esMesa={pedido.type === "MESA"} />
          )}

          {editable && puedeCobrar && (
            <Card>
              <CardContent>
                <AnularPedido
                  orderId={pedido.id}
                  vacio={renglones.length === 0}
                  esMesa={pedido.type === "MESA"}
                />
              </CardContent>
            </Card>
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
