import type { Metadata } from "next";
import Link from "next/link";
import { AppModule } from "@/generated/prisma/enums";
import { getCajaAbierta } from "@/features/caja/queries";
import { AbrirPedidoSinMesa } from "@/features/pedidos/components/abrir-sin-mesa";
import { ListaSinMesa } from "@/features/pedidos/components/lista-sin-mesa";
import { getPedidosAbiertos } from "@/features/pedidos/queries";
import { getSettings } from "@/features/negocio/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "POS" };
export const dynamic = "force-dynamic";

/**
 * El mostrador: la pantalla de entrada para un negocio que no sienta mesas.
 *
 * No depende del módulo MESAS a propósito —es justo la pantalla para cuando
 * está apagado—, y por eso no vive bajo /salon. Comparte con /salon la lista de
 * pedidos abiertos y el formulario de apertura porque es el mismo trabajo: un
 * pedido sin mesa es un pedido sin mesa, lo mire desde donde lo mire.
 */
export default async function PosPage() {
  // La página verifica por su cuenta: sesión, empresa, licencia y módulo.
  const ctx = await requireModule(AppModule.PEDIDOS);

  const [caja, pedidos, settings] = await Promise.all([
    getCajaAbierta(ctx.business.id),
    getPedidosAbiertos(ctx.business.id),
    getSettings(ctx.business.id),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">POS</h1>
          <p className="text-muted-foreground text-sm">
            {pedidos.length === 0
              ? "Sin pedidos abiertos."
              : `${pedidos.length} ${pedidos.length === 1 ? "pedido abierto" : "pedidos abiertos"}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AbrirPedidoSinMesa deliveryEnabled={settings.deliveryEnabled} />
          <Button asChild variant="outline">
            <Link href="/turnero" target="_blank" rel="noopener">
              Turnero
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/caja">Ir a caja</Link>
          </Button>
        </div>
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

      {pedidos.length === 0 && caja && (
        <p className="text-muted-foreground text-sm">
          Tocá &quot;Nuevo pedido&quot; para empezar a cobrar.
        </p>
      )}

      <ListaSinMesa pedidos={pedidos} />
    </div>
  );
}
