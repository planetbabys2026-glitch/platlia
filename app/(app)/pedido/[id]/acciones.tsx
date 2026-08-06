"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { PaymentMethod } from "@/generated/prisma/enums";
import {
  anularItem,
  anularPedido,
  cambiarCantidad,
  confirmarPedido,
  pedirCuenta,
  ponerNotaItem,
  quitarItem,
  registrarPago,
} from "@/features/pedidos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PantallaCargando } from "@/components/ui/cargando-overlay";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { formatTurno } from "@/lib/turns";

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
  isPending,
}: {
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  isPending?: boolean;
}) {
  const { pending } = useFormStatus();
  const cargando = pending || isPending;
  return (
    <>
      <PantallaCargando forcePending={cargando} />
      <Button type="submit" variant={variant} size={size} className={className} disabled={cargando}>
        {cargando ? "…" : children}
      </Button>
    </>
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
  const [, accion, isPending] = useActionState(cambiarCantidad, ESTADO_INICIAL);

  if (!editable) return <span className="numeral text-sm">{quantity}</span>;

  return (
    <span className="flex items-center gap-1">
      <form action={accion}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="quantity" value={Math.max(1, quantity - 1)} />
        <Enviar variant="outline" size="sm" className="size-7 p-0" isPending={isPending}>
          −
        </Enviar>
      </form>
      <span className="numeral w-6 text-center text-sm">{quantity}</span>
      <form action={accion}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="quantity" value={quantity + 1} />
        <Enviar variant="outline" size="sm" className="size-7 p-0" isPending={isPending}>
          +
        </Enviar>
      </form>
    </span>
  );
}

/**
 * La nota de un renglón ("sin cebolla", "extra salsa").
 */
export function NotaRenglon({ itemId, notes }: { itemId: string; notes: string | null }) {
  const [estado, accion, isPending] = useActionState(ponerNotaItem, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex items-center gap-1">
      <input type="hidden" name="itemId" value={itemId} />
      <Input
        key={notes ?? ""}
        name="notes"
        defaultValue={notes ?? ""}
        placeholder="Nota (sin cebolla, extra salsa…)"
        aria-label="Nota del renglón"
        maxLength={200}
        className="h-7 flex-1 text-xs"
      />
      <Enviar variant="ghost" size="sm" className="h-7 shrink-0 text-xs" isPending={isPending}>
        {notes ? "Guardar" : "Agregar"}
      </Enviar>
      {!estado.ok && estado.error && <span className="sr-only">{estado.error}</span>}
    </form>
  );
}

/** Sacar un renglón que cocina todavía no tomó: sin motivo, para cualquiera que atiende. */
export function QuitarRenglon({ itemId }: { itemId: string }) {
  const [estado, accion, isPending] = useActionState(quitarItem, ESTADO_INICIAL);

  return (
    <form action={accion} className="inline">
      <input type="hidden" name="itemId" value={itemId} />
      <Enviar variant="ghost" size="sm" className="h-7 text-xs" isPending={isPending}>
        Quitar
      </Enviar>
      {!estado.ok && estado.error && <span className="sr-only">{estado.error}</span>}
    </form>
  );
}

export function AnularRenglon({ itemId }: { itemId: string }) {
  const [estado, accion, isPending] = useActionState(anularItem, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex items-center gap-1">
      <input type="hidden" name="itemId" value={itemId} />
      <Input
        name="motivo"
        required
        minLength={3}
        placeholder="Motivo"
        aria-label="Motivo de la anulación"
        className="h-7 w-28 text-xs"
      />
      <Enviar variant="ghost" size="sm" className="h-7 text-xs" isPending={isPending}>
        Anular
      </Enviar>
      {!estado.ok && estado.error && <span className="sr-only">{estado.error}</span>}
    </form>
  );
}

/**
 * Anula el pedido entero.
 */
export function AnularPedido({
  orderId,
  vacio,
  esMesa,
}: {
  orderId: string;
  vacio: boolean;
  esMesa: boolean;
}) {
  const [estado, accion, isPending] = useActionState(anularPedido, ESTADO_INICIAL);

  const placeholder = !vacio
    ? "Motivo de la anulación"
    : esMesa
      ? "Motivo (mesa abierta por error)"
      : "Motivo (pedido abierto por error)";

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex items-center gap-1">
        <Input
          name="motivo"
          required
          minLength={3}
          placeholder={placeholder}
          aria-label="Motivo de la anulación del pedido"
          className="h-8 text-xs"
        />
        <Enviar variant="ghost" size="sm" className="h-8 text-xs" isPending={isPending}>
          Anular pedido
        </Enviar>
      </div>
      {!estado.ok && estado.error && (
        <p className="text-destructive text-xs">{estado.error}</p>
      )}
    </form>
  );
}

export function PedirCuenta({ orderId, esMesa }: { orderId: string; esMesa?: boolean }) {
  const router = useRouter();
  const [estado, accion, isPending] = useActionState(pedirCuenta, ESTADO_INICIAL);

  useEffect(() => {
    if (estado.ok && esMesa) {
      router.push("/salon");
    }
  }, [estado.ok, esMesa, router]);

  return (
    <form action={accion}>
      <input type="hidden" name="orderId" value={orderId} />
      <PantallaCargando forcePending={isPending} />
      <Button
        type="submit"
        variant="outline"
        className="w-full border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold h-11 shadow-sm gap-2"
        disabled={isPending}
      >
        {isPending ? "Enviando ticket a caja…" : "🧾 Pedir la cuenta (Enviar a caja)"}
      </Button>
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
  const [estado, accion, isPending] = useActionState(registrarPago, ESTADO_INICIAL);

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

      <Enviar className="w-full" isPending={isPending}>Registrar pago</Enviar>
    </form>
  );
}

export function ConfirmarPedido({
  orderId,
  hasItems,
  turnNumber,
  isMesa,
}: {
  orderId: string;
  hasItems: boolean;
  turnNumber: number | null;
  isMesa: boolean;
}) {
  const [estado, accion, isPending] = useActionState(confirmarPedido, ESTADO_INICIAL);

  if (!hasItems) return null;

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <PantallaCargando forcePending={isPending} />
      <Button
        type="submit"
        size="lg"
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg gap-2 h-12 text-base transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        disabled={isPending}
      >
        {isPending
          ? "Enviando a cocina…"
          : turnNumber !== null
            ? `✔ Comanda enviada (${formatTurno(turnNumber, 99, isMesa)})`
            : "👨‍🍳 Confirmar pedido y enviar a cocina"}
      </Button>
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
