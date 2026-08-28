"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { cerrarSinConsumo } from "@/features/pedidos/actions";
import { Button } from "@/components/ui/button";
import { PantallaCargando } from "@/components/marca/loader";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

/**
 * Cierra un pedido en el que nadie pidió nada.
 *
 * Está en `features/` y no dentro de una pantalla porque hacen falta tres:
 * la cuenta vacía de una mesa, el pedido para llevar que quedó en cero en la
 * lista del salón, y el mismo pedido abierto desde el POS. Los tres son el mismo
 * agujero —un pedido sin salida que traba el cierre de caja— y merecen el mismo
 * botón.
 *
 * Quien lo muestra decide cuándo: solo tiene sentido con cero renglones. La
 * acción lo verifica igual en el servidor.
 */
export function CerrarSinConsumo({
  orderId,
  texto = "Cerrar sin consumo",
  className,
  redirigirA,
}: {
  orderId: string;
  texto?: string;
  className?: string;
  /**
   * A dónde ir después de cerrar. Hace falta donde la pantalla no se rehace
   * sola: el POS mantiene su estado en el cliente, así que revalidar la ruta no
   * alcanza y el pedido cerrado se seguiría viendo como si estuviera abierto.
   * Donde el servidor pinta la lista —el salón, la mesa, la cuenta— no se pasa:
   * el `revalidatePath` de la acción ya lo resuelve.
   */
  redirigirA?: string;
}) {
  const router = useRouter();
  const [estado, accion, isPending] = useActionState(cerrarSinConsumo, ESTADO_INICIAL);

  useEffect(() => {
    if (estado.ok && redirigirA) router.push(redirigirA);
  }, [estado.ok, redirigirA, router]);

  return (
    <form action={accion} className={className}>
      <input type="hidden" name="orderId" value={orderId} />
      <Boton texto={texto} isPending={isPending} />
      {!estado.ok && estado.error && (
        <p className="text-destructive mt-1 text-xs">{estado.error}</p>
      )}
    </form>
  );
}

function Boton({ texto, isPending }: { texto: string; isPending: boolean }) {
  const { pending } = useFormStatus();
  const cargando = pending || isPending;

  return (
    <>
      <PantallaCargando forcePending={cargando} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="h-9 w-full text-xs"
        disabled={cargando}
      >
        {cargando ? "Cerrando…" : texto}
      </Button>
    </>
  );
}
