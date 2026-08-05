import type { Metadata } from "next";
import { AppModule } from "@/generated/prisma/enums";
import { getComandas } from "@/features/cocina/queries";
import { getSettings } from "@/features/negocio/queries";
import { requireModule } from "@/lib/auth/dal";
import { currentBusinessDate } from "@/lib/time";
import { Comanda, RefrescoAutomatico } from "./comanda";

export const metadata: Metadata = { title: "Cocina" };
export const dynamic = "force-dynamic";

export default async function CocinaPage() {
  const ctx = await requireModule(AppModule.COCINA);
  const settings = await getSettings(ctx.business.id);
  const estaciones = await getComandas(ctx.business.id, currentBusinessDate(settings));

  const total = estaciones.reduce((n, e) => n + e.comandas.length, 0);

  return (
    <div className="space-y-6">
      <RefrescoAutomatico />

      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Cocina</h1>
        <p className="text-muted-foreground text-sm">
          {total === 0
            ? "Todo despachado."
            : `${total} ${total === 1 ? "comanda pendiente" : "comandas pendientes"}.`}
        </p>
      </div>

      {estaciones.map((estacion) => (
        <section key={estacion.nombre} className="space-y-3">
          <h2 className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase">
            {estacion.nombre} · {estacion.comandas.length}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {estacion.comandas.map((item) => (
              <li key={item.id}>
                <Comanda
                  comanda={{
                    id: item.id,
                    nombre: item.nameSnapshot,
                    cantidad: item.quantity,
                    notas: item.notes,
                    estado: item.status,
                    // Se manda como número: un Date cruza el límite RSC, pero un
                    // número no deja lugar a sorpresas de zona horaria.
                    desde: (item.sentToKitchenAt ?? item.createdAt).getTime(),
                    minutosEstimados: item.product.preparationMinutes,
                    pedido: {
                      code: item.order.code,
                      mesa: item.order.table?.name ?? null,
                      turno: item.order.turnNumber,
                    },
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {total === 0 && (
        <p className="text-muted-foreground text-sm">
          Cuando el salón cante un producto, aparece acá.
        </p>
      )}
    </div>
  );
}
