import Link from "next/link";
import { formatCop } from "@/lib/money";

export type PedidoSinMesa = {
  id: string;
  code: number;
  turnNumber: number | null;
  type: string;
  totalCop: number;
  customerName: string | null;
};

/**
 * Los pedidos para llevar y a domicilio que siguen abiertos.
 *
 * La usan /salon (que además tiene mesas) y /pos (que no): es la misma lista,
 * solo cambia qué más hay alrededor en cada pantalla.
 */
export function ListaSinMesa({ pedidos }: { pedidos: PedidoSinMesa[] }) {
  if (pedidos.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase">
        Para llevar y domicilios
      </h2>
      <ul className="divide-border border-border/80 divide-y rounded-2xl border overflow-hidden bg-card shadow-xs">
        {pedidos.map((pedido) => (
          <li key={pedido.id}>
            <Link
              href={`/pedido/${pedido.id}`}
              className="group flex items-center justify-between gap-4 px-4 py-3.5 transition-all duration-200 hover:bg-accent/80 hover:translate-x-1"
            >
              <span className="flex items-center gap-3">
                {pedido.turnNumber !== null && (
                  <span className="numeral bg-secondary text-secondary-foreground rounded-lg px-2.5 py-1 text-sm font-bold shadow-xs transition-all duration-200 group-hover:bg-brand group-hover:text-brand-foreground group-hover:scale-105">
                    {pedido.turnNumber}
                  </span>
                )}
                <span className="text-sm font-medium transition-colors duration-200 group-hover:text-brand">
                  {pedido.customerName ?? `Pedido ${pedido.code}`}
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {pedido.type === "DOMICILIO" ? "domicilio" : "para llevar"}
                  </span>
                </span>
              </span>
              <span className="numeral text-sm font-semibold transition-transform duration-200 group-hover:scale-105">{formatCop(pedido.totalCop)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
