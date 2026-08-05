import type { Metadata } from "next";
import Link from "next/link";
import { AppModule } from "@/generated/prisma/enums";
import { getCajaAbierta } from "@/features/caja/queries";
import { getPedidosAbiertos } from "@/features/pedidos/queries";
import { getSalon } from "@/features/salon/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth/dal";
import { formatCop } from "@/lib/money";
import { Mesa } from "./mesa";

export const metadata: Metadata = { title: "Salón" };
export const dynamic = "force-dynamic";

export default async function SalonPage() {
  // La página verifica por su cuenta: sesión, empresa, licencia y módulo.
  const ctx = await requireModule(AppModule.MESAS);

  const [areas, caja, pedidos] = await Promise.all([
    getSalon(ctx.business.id),
    getCajaAbierta(ctx.business.id),
    getPedidosAbiertos(ctx.business.id),
  ]);

  const paraLlevar = pedidos.filter((p) => p.type !== "MESA");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Salón</h1>
          <p className="text-muted-foreground text-sm">
            {pedidos.length === 0
              ? "Sin pedidos abiertos."
              : `${pedidos.length} ${pedidos.length === 1 ? "pedido abierto" : "pedidos abiertos"}.`}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/caja">Ir a caja</Link>
        </Button>
      </div>

      {!caja && (
        <Alert>
          <AlertTitle>No hay caja abierta</AlertTitle>
          <AlertDescription>
            Mientras no haya un turno abierto no se pueden tomar pedidos.{" "}
            <Link href="/caja" className="text-primary font-medium hover:underline">
              Abrir caja
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {areas.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Este negocio todavía no tiene mesas cargadas.
        </p>
      )}

      {areas.map((area) => (
        <section key={area.id} className="space-y-3">
          <h2 className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase">
            {area.name}
          </h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {area.mesas.map((mesa) => (
              <li key={mesa.id}>
                <Mesa mesa={mesa} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {paraLlevar.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase">
            Para llevar y domicilios
          </h2>
          <ul className="divide-border border-border divide-y rounded-xl border">
            {paraLlevar.map((pedido) => (
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
                  <span className="numeral text-sm font-medium">
                    {formatCop(pedido.totalCop)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
