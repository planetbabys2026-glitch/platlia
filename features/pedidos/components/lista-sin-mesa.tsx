import Link from "next/link";
import { Bike, ShoppingBag, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CerrarSinConsumo } from "@/features/pedidos/components/cerrar-sin-consumo";
import { formatCop } from "@/lib/money";

export type PedidoSinMesa = {
  id: string;
  code: number;
  turnNumber: number | null;
  type: string;
  totalCop: number;
  customerName: string | null;
  /** Renglones no anulados: en cero, el pedido se puede cerrar sin cobrar. */
  renglones: number;
};

/**
 * Los pedidos para llevar, en sitio (sin mesa) y a domicilio que siguen abiertos.
 */
export function ListaSinMesa({ pedidos }: { pedidos: PedidoSinMesa[] }) {
  if (pedidos.length === 0) return null;

  return (
    <section className="space-y-3.5 pt-2">
      <div className="flex items-center gap-3 font-mono text-rotulo tracking-[0.16em] uppercase text-muted-foreground">
        <span>
          Pedidos sin mesa · <span className="numeral font-bold text-foreground">{pedidos.length}</span> EN CURSO
        </span>
        <span className="flex-1 border-t border-dashed border-border/80" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {pedidos.map((pedido) => {
          const esDomicilio = pedido.type === "DOMICILIO";
          const esEnSitio = pedido.type === "EN_SITIO";
          const TipoIcono = esDomicilio ? Bike : esEnSitio ? Utensils : ShoppingBag;

          return (
            <div
              key={pedido.id}
              className="group flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-xs transition-all hover:border-brand/50 hover:shadow-md"
            >
              <Link href={`/pedido/${pedido.id}`} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-bold text-sm text-foreground block truncate group-hover:text-brand transition-colors">
                      {pedido.customerName ?? `Pedido #${pedido.code}`}
                    </span>
                    <span className="text-muted-foreground text-xs block">
                      Pedido #{pedido.code}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {pedido.turnNumber !== null && (
                      <Badge variant="outline" className="font-mono text-rotulo font-bold">
                        Turno 0{pedido.turnNumber}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="text-rotulo font-semibold text-muted-foreground gap-1 px-2"
                    >
                      <TipoIcono className="size-3" />
                      <span>{esDomicilio ? "Domicilio" : esEnSitio ? "En sitio" : "Llevar"}</span>
                    </Badge>
                  </div>
                </div>

                <div className="flex items-baseline justify-between pt-1 border-t border-border/40">
                  <span className="text-rotulo text-muted-foreground">
                    {pedido.renglones === 0
                      ? "Sin productos"
                      : `${pedido.renglones} ${pedido.renglones === 1 ? "ítem" : "ítems"}`}
                  </span>
                  <span className="numeral font-bold text-base text-foreground">
                    {formatCop(pedido.totalCop)}
                  </span>
                </div>
              </Link>

              {pedido.renglones === 0 && (
                <div className="pt-2 border-t border-border/40 mt-2">
                  <CerrarSinConsumo orderId={pedido.id} texto="Cerrar pedido vacío" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
