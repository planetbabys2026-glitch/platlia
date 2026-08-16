import type { Metadata } from "next";
import Link from "next/link";
import { AppModule } from "@/generated/prisma/enums";
import { getCajaAbierta } from "@/features/caja/queries";
import { AbrirPedidoSinMesa } from "@/features/pedidos/components/abrir-sin-mesa";
import { ListaSinMesa } from "@/features/pedidos/components/lista-sin-mesa";
import { getPedidosAbiertos } from "@/features/pedidos/queries";
import { getSalon } from "@/features/salon/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireModule } from "@/lib/auth/dal";
import { Mesa } from "./tarjeta-mesa";

export const metadata: Metadata = { title: "Salón en Vivo · Platlia" };
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
  const pedidosConCuenta = pedidos.filter((p) => p.status === "CUENTA_PEDIDA");
  // Mesas y cuentas se cuentan aparte: una mesa con tres cuentas separadas es una
  // mesa ocupada, no tres. El contador viejo sumaba pedidos y decía "3 ocupadas"
  // con una sola mesa llena.
  const mesasOcupadas = areas.reduce(
    (total, area) => total + area.mesas.filter((mesa) => mesa.cuentas.length > 0).length,
    0,
  );
  const cuentasAbiertas = areas.reduce(
    (total, area) => total + area.mesas.reduce((suma, mesa) => suma + mesa.cuentas.length, 0),
    0,
  );

  return (
    <div className="space-y-8 max-w-7xl">
      {/* ─── Header Salón Dark Kitchen-Fire ─── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-border/80 pb-5">
        <div>
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-foreground leading-[0.95]">
            Salón en Vivo
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1.5 font-sans">
            Plano de mesas en tiempo real · Control de tiempos de consumo y pre-cuentas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="chip is-hot">
            {mesasOcupadas} {mesasOcupadas === 1 ? "OCUPADA" : "OCUPADAS"}
          </span>
          {cuentasAbiertas > mesasOcupadas && (
            <span className="chip">{cuentasAbiertas} CUENTAS</span>
          )}
          {pedidosConCuenta.length > 0 && (
            <span className="chip border-brand text-brand">
              {pedidosConCuenta.length} PIDIERON CUENTA
            </span>
          )}

          {/* Solo lo que se hace desde acá. El salón es tomar pedidos, mandar
              comandas y cerrar cuentas para que lleguen a la caja; el turnero es
              un televisor que se abre una vez por turno y la caja tiene su
              propio ítem en el menú, siempre a la vista. Repetirlos acá era
              ruido en la barra que más se toca del sistema. */}
          <AbrirPedidoSinMesa />
        </div>
      </div>

      {!caja && (
        <Alert className="border-brand/40 bg-brand/10 text-brand">
          <AlertTitle className="font-bold font-mono text-xs uppercase tracking-wider">
            No hay caja abierta
          </AlertTitle>
          <AlertDescription className="text-xs">
            Mientras no haya un turno abierto no se pueden tomar pedidos.{" "}
            <Link href="/caja" className="text-foreground font-bold underline underline-offset-4 hover:text-brand">
              Abrir turno de caja
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {areas.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
          Este negocio todavía no tiene áreas ni mesas configuradas.{" "}
          <Link href="/administracion/salon" className="text-brand underline font-medium">
            Crear mesas en administración
          </Link>
        </div>
      )}

      {/* ─── Zonas y Mesas ─── */}
      {areas.map((area) => (
        <section key={area.id} className="space-y-3.5">
          <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.16em] uppercase text-muted-foreground">
            <span>
              {area.name} · <span className="numeral font-bold text-foreground">{area.mesas.length}</span> MESAS
            </span>
            <span className="flex-1 border-t border-dashed border-border/80" />
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
            {area.mesas.map((mesa) => (
              <li key={mesa.id}>
                <Mesa mesa={mesa} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Pedidos sin mesa / Para llevar */}
      <ListaSinMesa pedidos={paraLlevar} />
    </div>
  );
}
