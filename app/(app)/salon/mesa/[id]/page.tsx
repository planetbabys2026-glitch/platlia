import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
 * Existe porque una mesa dejó de ser un pedido: un grupo que llega junto y pide
 * por separado abre una cuenta por persona, y el QR de la mesa abre otra cada vez
 * que alguien manda un pedido desde su celular. Antes el salón mostraba una sola
 * y el resto quedaba invisible hasta que aparecía en cocina.
 */
export default async function MesaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireModule(AppModule.MESAS);

  const mesa = await getMesa(ctx.business.id, id);
  // El cliente está acotado a la empresa, así que una mesa de otro negocio no
  // aparece: es un 404 igual que una inexistente.
  if (!mesa) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-border/80 pb-5">
        <div className="space-y-1">
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight leading-[0.95]">
            Mesa {mesa.name}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {mesa.area ? `${mesa.area.name} · ` : ""}
            {mesa.capacity} puestos
            {mesa.cuentas.length > 0 && (
              <>
                {" · "}
                <span className="text-foreground font-medium">
                  {mesa.cuentas.length}{" "}
                  {mesa.cuentas.length === 1 ? "cuenta abierta" : "cuentas abiertas"}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {mesa.totalCop > 0 && (
            <span className="numeral font-display text-2xl font-black">
              {formatCop(mesa.totalCop)}
            </span>
          )}
          <Link
            href="/salon"
            className="text-primary text-sm font-medium hover:underline"
          >
            ← Volver al salón
          </Link>
        </div>
      </div>

      {mesa.cuentas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground text-sm">
            Esta mesa está libre. Abrí la primera cuenta acá abajo.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {mesa.cuentas.map((cuenta, indice) => (
            <li key={cuenta.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="numeral bg-secondary text-secondary-foreground flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                        {indice + 1}
                      </span>
                      <span className="text-sm font-semibold leading-tight">
                        {cuenta.etiqueta}
                      </span>
                    </span>
                    {cuenta.status === "CUENTA_PEDIDA" && (
                      <Badge variant="secondary">{ESTADO_CUENTA[cuenta.status]}</Badge>
                    )}
                  </div>

                  <p className="text-muted-foreground text-xs">
                    {cuenta.renglones === 0
                      ? "Sin productos todavía"
                      : `${cuenta.renglones} ${cuenta.renglones === 1 ? "producto" : "productos"}`}
                    {" · abrió "}
                    {cuenta.abrioPor}
                  </p>

                  <span className="numeral text-xl font-semibold">
                    {formatCop(cuenta.totalCop)}
                  </span>

                  <RenombrarCuenta orderId={cuenta.id} customerName={cuenta.customerName} />

                  <div className="mt-auto space-y-2 pt-1">
                    <Link
                      href={`/pedido/${cuenta.id}`}
                      className="bg-brand text-brand-foreground hover:bg-brand/90 flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold transition-colors"
                    >
                      Abrir cuenta
                    </Link>
                    {cuenta.renglones === 0 && <CerrarSinConsumo orderId={cuenta.id} />}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Agregar otra cuenta</h2>
            <p className="text-muted-foreground text-xs">
              Cada cuenta lleva su propia comanda a la cocina y se cobra por
              separado. El nombre es lo que le permite al cocinero saber de quién
              es cada plato.
            </p>
          </div>
          <NuevaCuenta tableId={mesa.id} />
        </CardContent>
      </Card>

      {/* Liberar la mesa entera solo tiene sentido si nadie pidió nada: con
          consumo hay que cobrar, y cerrar la mitad dejaría al mesero creyendo
          que la mesa quedó libre. */}
      {mesa.sinConsumo && (
        <Card className="border-dashed">
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-xs">
              {mesa.cuentas.length === 1
                ? "Nadie pidió nada en esta mesa."
                : "Ninguna de estas cuentas tiene consumo."}{" "}
              Se puede cerrar todo y dejar la mesa libre.
            </p>
            <LiberarMesa tableId={mesa.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
