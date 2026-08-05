"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { PaymentMethod } from "@/generated/prisma/enums";
import {
  anularItem,
  cambiarCantidad,
  pedirCuenta,
  registrarPago,
} from "@/features/pedidos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";

/** Etiquetas de los métodos de pago, como se dicen en Colombia. */
const METODOS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "Tarjeta débito",
  TARJETA_CREDITO: "Tarjeta crédito",
  NEQUI: "Nequi",
  DAVIPLATA: "Daviplata",
  TRANSFERENCIA: "Transferencia",
  BONO: "Bono",
  OTRO: "Otro",
};

function Enviar({
  children,
  variant,
  size,
  className,
}: {
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending}>
      {pending ? "…" : children}
    </Button>
  );
}

/** Los ± de un renglón. Cantidad 1 y "−" no anula: anular exige motivo. */
export function ControlCantidad({
  itemId,
  quantity,
  editable,
}: {
  itemId: string;
  quantity: number;
  editable: boolean;
}) {
  const [, accion] = useActionState(cambiarCantidad, ESTADO_INICIAL);

  if (!editable) return <span className="numeral text-sm">{quantity}</span>;

  return (
    <span className="flex items-center gap-1">
      <form action={accion}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="quantity" value={Math.max(1, quantity - 1)} />
        <Enviar variant="outline" size="sm" className="size-7 p-0">
          −
        </Enviar>
      </form>
      <span className="numeral w-6 text-center text-sm">{quantity}</span>
      <form action={accion}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="quantity" value={quantity + 1} />
        <Enviar variant="outline" size="sm" className="size-7 p-0">
          +
        </Enviar>
      </form>
    </span>
  );
}

export function AnularRenglon({ itemId }: { itemId: string }) {
  const [estado, accion] = useActionState(anularItem, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex items-center gap-1">
      <input type="hidden" name="itemId" value={itemId} />
      {/* El motivo es obligatorio: una anulación es de lo que después se discute. */}
      <Input
        name="motivo"
        required
        minLength={3}
        placeholder="Motivo"
        aria-label="Motivo de la anulación"
        className="h-7 w-28 text-xs"
      />
      <Enviar variant="ghost" size="sm" className="h-7 text-xs">
        Anular
      </Enviar>
      {!estado.ok && estado.error && <span className="sr-only">{estado.error}</span>}
    </form>
  );
}

export function PedirCuenta({ orderId }: { orderId: string }) {
  const [estado, accion] = useActionState(pedirCuenta, ESTADO_INICIAL);

  return (
    <form action={accion}>
      <input type="hidden" name="orderId" value={orderId} />
      <Enviar variant="outline" className="w-full">
        Pedir la cuenta
      </Enviar>
      {!estado.ok && estado.error && (
        <p className="text-destructive mt-2 text-xs">{estado.error}</p>
      )}
    </form>
  );
}

export function Cobrar({
  orderId,
  faltanteCop,
}: {
  orderId: string;
  faltanteCop: number;
}) {
  const [estado, accion] = useActionState(registrarPago, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      {estado.ok && estado.data && !estado.data.cerrado && (
        <Alert role="status">
          <AlertDescription>
            Pago registrado. Faltan {formatCop(estado.data.faltanteCop)}.
          </AlertDescription>
        </Alert>
      )}

      {estado.ok && estado.data?.changeCop ? (
        <Alert role="status">
          <AlertDescription>
            Vuelto: <strong className="numeral">{formatCop(estado.data.changeCop)}</strong>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="metodo">Método</Label>
        <select
          id="metodo"
          name="method"
          defaultValue={PaymentMethod.EFECTIVO}
          className="border-input bg-card focus-visible:ring-ring h-9 w-full rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
        >
          {Object.values(PaymentMethod).map((metodo) => (
            <option key={metodo} value={metodo}>
              {METODOS[metodo]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="monto">Monto</Label>
          {/* `key` con el faltante, y no solo `defaultValue`: un input no
              controlado toma su valor al montarse y React NO lo vuelve a
              sincronizar cuando la prop cambia. Sin esto, agregar un producto
              después de abrir el cobro dejaba el monto viejo y se cobraba de
              menos —que es la clase de error que nadie nota hasta el cierre. */}
          <Input
            key={faltanteCop}
            id="monto"
            name="amountCop"
            inputMode="numeric"
            defaultValue={faltanteCop}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="entregado">Con cuánto paga</Label>
          <Input
            id="entregado"
            name="tenderedCop"
            inputMode="numeric"
            placeholder="opcional"
          />
        </div>
      </div>

      <Enviar className="w-full">Registrar pago</Enviar>
    </form>
  );
}
