"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { OrderType } from "@/generated/prisma/enums";
import { abrirPedido } from "@/features/pedidos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

import { PantallaCargando } from "@/components/ui/cargando-overlay";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <>
      <PantallaCargando forcePending={pending} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Abriendo…" : "Nuevo pedido"}
      </Button>
    </>
  );
}

/**
 * Abre un pedido sin mesa y lleva derecho a él.
 *
 * Un botón y nada más. Antes esta barra pedía acá el tipo de consumo, el nombre,
 * el teléfono y la dirección, y después la pantalla del pedido volvía a
 * preguntar lo mismo: eran dos formularios para un solo dato, y el de acá era
 * además el peor lugar para llenarlo —al lado del plano de mesas, antes de saber
 * siquiera qué va a pedir el cliente—.
 *
 * Ahora el pedido nace `LLEVAR`, que es el caso más común, y el tipo se elige
 * adentro junto con los datos que ese tipo necesita: `ModuloPosInteractive` ya
 * ofrece Llevar / En sitio / Domicilio y exige celular y dirección cuando hace
 * falta. Un solo lugar donde decidirlo, y el que tiene el contexto.
 */
export function AbrirPedidoSinMesa() {
  const router = useRouter();
  const [estado, accion] = useActionState(abrirPedido, ESTADO_INICIAL);

  useEffect(() => {
    if (estado.ok && estado.data?.id) router.push(`/pedido/${estado.data.id}`);
  }, [estado, router]);

  return (
    <form action={accion} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="type" value={OrderType.LLEVAR} />

      <Enviar />

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert" className="w-full">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
