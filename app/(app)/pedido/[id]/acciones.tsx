"use client";

import { useActionState, useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectorDePropina } from "@/features/pedidos/components/propina";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { formatTurno } from "@/lib/turns";
import { cn } from "@/lib/utils";

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
    // Sin velo a pantalla completa. Estas son acciones que ocurren adentro de la
    // pantalla que uno está mirando —subir una cantidad, poner una nota— y taparla
    // entera mientras tanto dejaba la aplicación muda y sorda: los toques caían
    // sobre el overlay, así que la gente tocaba otra vez. El botón alcanza.
    <Button type="submit" variant={variant} size={size} className={className} disabled={cargando}>
      {cargando ? "…" : children}
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

/**
 * Pedir la cuenta, eligiendo antes si lleva propina.
 *
 * La elección va acá y no en la caja: el mesero le pregunta al cliente en la
 * mesa, y la pre-cuenta que después se imprime tiene que salir con ese total. Si
 * se eligiera al cobrar, el papel que se llevó a la mesa diría una cosa y la caja
 * cobraría otra.
 */
export function PedirCuenta({
  orderId,
  esMesa,
  propina,
  tipActualCop = 0,
}: {
  orderId: string;
  esMesa?: boolean;
  propina?: { habilitada: boolean; rateBp: number; sugeridaCop: number };
  tipActualCop?: number;
}) {
  const router = useRouter();
  const [estado, accion, isPending] = useActionState(pedirCuenta, ESTADO_INICIAL);
  const [propinaCop, setPropinaCop] = useState(tipActualCop);

  useEffect(() => {
    if (estado.ok && esMesa) {
      router.push("/salon");
    }
  }, [estado.ok, esMesa, router]);

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="tipCop" value={propinaCop} />

      {propina && (
        <SelectorDePropina
          habilitado={propina.habilitada}
          sugeridaCop={propina.sugeridaCop}
          rateBp={propina.rateBp}
          valorCop={propinaCop}
          onCambiar={setPropinaCop}
          id={orderId}
        />
      )}

      <Button
        type="submit"
        variant="outline"
        className="w-full border-warning/50 bg-warning/10 hover:bg-warning/20 text-warning-soft font-bold h-11 shadow-sm gap-2"
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
          className="h-11 tableta:h-10 w-full rounded-lg border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 text-sm focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
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
  turnNumber,
  isMesa,
  itemsSinEnviarCount = 0,
}: {
  orderId: string;
  turnNumber: number | null;
  isMesa: boolean;
  itemsSinEnviarCount?: number;
}) {
  const [estado, accion, isPending] = useActionState(confirmarPedido, ESTADO_INICIAL);

  const tieneNuevosPendientes = itemsSinEnviarCount > 0;
  const yaEnviadoSinPendientes = turnNumber !== null && !tieneNuevosPendientes;

  let textoBoton = "👨‍🍳 Confirmar pedido y enviar a cocina";
  if (isPending) {
    textoBoton = "Enviando a cocina…";
  } else if (turnNumber === null) {
    textoBoton = "👨‍🍳 Confirmar pedido y enviar a cocina";
  } else if (tieneNuevosPendientes) {
    textoBoton =
      itemsSinEnviarCount === 1
        ? "👨‍🍳 Enviar 1 nuevo producto a cocina"
        : `👨‍🍳 Enviar adición a cocina (${itemsSinEnviarCount} productos)`;
  } else {
    textoBoton = `✔ Comanda enviada (${formatTurno(turnNumber, 99, isMesa)})`;
  }

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <Button
        type="submit"
        size="lg"
        className={cn(
          "w-full font-bold shadow-lg gap-2 h-12 text-base transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
          yaEnviadoSinPendientes
            ? "bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80"
            : tieneNuevosPendientes
              ? "bg-brand hover:bg-brand/90 text-brand-foreground shadow-brand/20 animate-pulse"
              : "bg-success hover:bg-success/90 text-white"
        )}
        disabled={isPending}
      >
        {textoBoton}
      </Button>
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
