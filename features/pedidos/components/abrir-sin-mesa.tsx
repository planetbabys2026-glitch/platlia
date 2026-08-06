"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { OrderType } from "@/generated/prisma/enums";
import { abrirPedido } from "@/features/pedidos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

import { PantallaCargando } from "@/components/ui/cargando-overlay";

function Enviar({ isPending }: { isPending?: boolean }) {
  const { pending } = useFormStatus();
  const cargando = pending || isPending;
  return (
    <>
      <PantallaCargando forcePending={cargando} />
      <Button type="submit" variant="outline" disabled={cargando}>
        {cargando ? "Abriendo…" : "Nuevo pedido"}
      </Button>
    </>
  );
}

/**
 * Abre un pedido sin mesa: para llevar, o a domicilio si el negocio lo ofrece.
 *
 * Es lo que le da número de turno: `abrirPedido` solo lo asigna cuando el pedido
 * no es de mesa, porque una mesa se llama por su número y no por turno.
 *
 * Sin domicilio habilitado ni siquiera se ofrece el selector: un negocio que no
 * reparte no tiene por qué ver la opción ni pensar en ella.
 *
 * Todos los campos son controlados a propósito, aunque sea más código que un
 * simple `<Input defaultValue>`: React 19 resetea el `<form>` a nivel del DOM
 * después de cada envío, éxito o error —así sea con `action={...}`—, y ese
 * reset nativo no dispara `onChange`, así que React nunca se entera y no
 * vuelve a escribir el valor. Un campo de texto controlado sobrevive porque
 * React igual conserva el string en su estado; el `<select>` necesita algo más
 * (ver el `useEffect` de abajo) porque el reset nativo sí le cambia el
 * `selectedIndex` en el DOM sin que React lo note.
 */
export function AbrirPedidoSinMesa({ deliveryEnabled }: { deliveryEnabled: boolean }) {
  const router = useRouter();
  const [estado, accion] = useActionState(abrirPedido, ESTADO_INICIAL);
  const [tipo, setTipo] = useState<typeof OrderType.LLEVAR | typeof OrderType.DOMICILIO>(
    OrderType.LLEVAR,
  );
  const [customerName, setCustomerName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (estado.ok && estado.data?.id) router.push(`/pedido/${estado.data.id}`);
  }, [estado, router]);

  // Se reafirma después de cada envío: el reset nativo del formulario le puede
  // haber cambiado el valor visible al <select> sin que React se enterara.
  useEffect(() => {
    if (selectRef.current) selectRef.current.value = tipo;
  }, [estado, tipo]);

  const campos = !estado.ok ? estado.campos : undefined;

  return (
    <form action={accion} className="flex flex-wrap items-start gap-2">
      {deliveryEnabled ? (
        <select
          ref={selectRef}
          name="type"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
          aria-label="Tipo de pedido"
          className="border-input bg-card focus-visible:ring-ring h-9 rounded-lg border px-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
        >
          <option value={OrderType.LLEVAR}>Para llevar</option>
          <option value={OrderType.DOMICILIO}>Domicilio</option>
        </select>
      ) : (
        <input type="hidden" name="type" value={OrderType.LLEVAR} />
      )}

      <Input
        name="customerName"
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
        placeholder="Nombre del cliente (opcional)"
        aria-label="Nombre del cliente"
        className="w-56"
      />

      {tipo === OrderType.DOMICILIO && deliveryEnabled && (
        <div className="space-y-1">
          <Input
            name="deliveryAddress"
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            placeholder="Dirección de entrega"
            aria-label="Dirección de entrega"
            className="w-56"
          />
          {campos?.deliveryAddress && (
            <p className="text-destructive text-xs">{campos.deliveryAddress[0]}</p>
          )}
        </div>
      )}

      <Enviar />

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert" className="w-full">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
