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
      <ul className="divide-border border-border divide-y rounded-xl border">
        {pedidos.map((pedido) => (
          <li key={pedido.id}>
            <Link
              href={`/pedido/${pedido.id}`}
              className="hover:bg-accent flex items-center justify-between gap-4 px-4 py-3"
            >
              <span className="flex items-center gap-3">
                {pedido.turnNumber !== null && (
                  <span className="numeral bg-secondary rounded-md px-2 py-1 text-sm font-semibold">
                    {pedido.turnNumber}
                  </span>
                )}
                <span className="text-sm">
                  {pedido.customerName ?? `Pedido ${pedido.code}`}
                  <span className="text-muted-foreground ml-2 text-xs">
                    {pedido.type === "DOMICILIO" ? "domicilio" : "para llevar"}
                  </span>
                </span>
              </span>
              <span className="numeral text-sm font-medium">{formatCop(pedido.totalCop)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
