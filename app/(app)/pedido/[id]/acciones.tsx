"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { PaymentMethod } from "@/generated/prisma/enums";
import { CheckCircle2, CreditCard, Minus, Plus, ReceiptText, Trash2, UtensilsCrossed } from "lucide-react";
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
import { CalculadoraDividirCuenta } from "./calculadora-dividir-cuenta";

/** Etiquetas de los métodos de pago en Colombia. */
const METODOS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "Tarjeta débito",
  TARJETA_CREDITO: "Tarjeta crédito",
  NEQUI: "Nequi",
  DAVIPLATA: "Daviplata",
  TRANSFERENCIA: "Transferencia bancaria",
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
    <Button type="submit" variant={variant} size={size} className={className} disabled={cargando}>
      {cargando ? "…" : children}
    </Button>
  );
}

/** Los ± de un renglón. */
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

  if (!editable) return <span className="numeral text-xs font-bold text-foreground">{quantity}</span>;

  return (
    <span className="flex items-center gap-1">
      <form action={accion}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="quantity" value={Math.max(1, quantity - 1)} />
        <Enviar variant="outline" size="sm" className="size-6 p-0 rounded-md" isPending={isPending}>
          <Minus className="size-3" />
        </Enviar>
      </form>
      <span className="numeral w-6 text-center text-xs font-bold text-foreground">{quantity}</span>
      <form action={accion}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="quantity" value={quantity + 1} />
        <Enviar variant="outline" size="sm" className="size-6 p-0 rounded-md" isPending={isPending}>
          <Plus className="size-3" />
        </Enviar>
      </form>
    </span>
  );
}

/** La nota de un renglón ("sin cebolla", "extra salsa"). */
export function NotaRenglon({ itemId, notes }: { itemId: string; notes: string | null }) {
  const [estado, accion, isPending] = useActionState(ponerNotaItem, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex items-center gap-1.5 pt-0.5">
      <input type="hidden" name="itemId" value={itemId} />
      <Input
        key={notes ?? ""}
        name="notes"
        defaultValue={notes ?? ""}
        placeholder="Nota de cocina (ej. sin cebolla, término medio…)"
        aria-label="Nota del renglón"
        maxLength={200}
        className="h-7 flex-1 text-xs rounded-lg bg-muted/30"
      />
      <Enviar variant="ghost" size="sm" className="h-7 shrink-0 text-xs px-2" isPending={isPending}>
        {notes ? "Guardar" : "Nota"}
      </Enviar>
      {!estado.ok && estado.error && <span className="sr-only">{estado.error}</span>}
    </form>
  );
}

/** Sacar un renglón antes de enviarlo a cocina. */
export function QuitarRenglon({ itemId }: { itemId: string }) {
  const [estado, accion, isPending] = useActionState(quitarItem, ESTADO_INICIAL);

  return (
    <form action={accion} className="inline">
      <input type="hidden" name="itemId" value={itemId} />
      <Enviar
        variant="ghost"
        size="sm"
        className="h-6 text-rotulo text-destructive hover:bg-destructive/10 px-1.5 gap-1 rounded-md"
        isPending={isPending}
      >
        <Trash2 className="size-3" /> Quitar
      </Enviar>
      {!estado.ok && estado.error && <span className="sr-only">{estado.error}</span>}
    </form>
  );
}

export function AnularRenglon({ itemId }: { itemId: string }) {
  const [estado, accion, isPending] = useActionState(anularItem, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex items-center gap-1 pt-1">
      <input type="hidden" name="itemId" value={itemId} />
      <Input
        name="motivo"
        required
        minLength={3}
        placeholder="Motivo de anulación"
        aria-label="Motivo de la anulación"
        className="h-7 w-36 text-xs rounded-lg"
      />
      <Enviar variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:bg-destructive/10" isPending={isPending}>
        Anular
      </Enviar>
      {!estado.ok && estado.error && <span className="sr-only">{estado.error}</span>}
    </form>
  );
}

/** Anula el pedido entero con motivo justificado. */
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
    ? "Motivo de anulación del pedido"
    : esMesa
      ? "Motivo (mesa abierta por error)"
      : "Motivo (pedido abierto por error)";

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex items-center gap-1.5">
        <Input
          name="motivo"
          required
          minLength={3}
          placeholder={placeholder}
          aria-label="Motivo de la anulación del pedido"
          className="h-8 text-xs rounded-lg"
        />
        <Enviar
          variant="outline"
          size="sm"
          className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0 rounded-lg"
          isPending={isPending}
        >
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
 * Pedir la cuenta para la mesa (genera pre-cuenta y marca CUENTA_PEDIDA para Caja).
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
        className="w-full border-border bg-card hover:bg-muted/80 text-foreground font-bold text-xs h-10 rounded-xl shadow-xs gap-2"
        disabled={isPending}
      >
        <ReceiptText className="size-4 text-muted-foreground" />
        <span>{isPending ? "Solicitando cuenta…" : "Pedir la cuenta (Enviar a caja)"}</span>
      </Button>
      {!estado.ok && estado.error && (
        <p className="text-destructive mt-1 text-xs">{estado.error}</p>
      )}
    </form>
  );
}

/** Registro de cobro directo (POS mostrador). */
export function Cobrar({
  orderId,
  faltanteCop,
}: {
  orderId: string;
  faltanteCop: number;
}) {
  const [estado, accion, isPending] = useActionState(registrarPago, ESTADO_INICIAL);
  const [montoACobrar, setMontoACobrar] = useState<number>(faltanteCop);

  // Sincronizar monto si cambia el faltante externo
  useEffect(() => {
    setMontoACobrar(faltanteCop);
  }, [faltanteCop]);

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

      <CalculadoraDividirCuenta
        faltanteCop={faltanteCop}
        onSeleccionarMonto={(monto) => setMontoACobrar(monto)}
      />

      <div className="space-y-1">
        <Label htmlFor="metodo" className="text-xs text-muted-foreground">Método de pago</Label>
        <select
          id="metodo"
          name="method"
          defaultValue={PaymentMethod.EFECTIVO}
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
        >
          {Object.values(PaymentMethod).map((metodo) => (
            <option key={metodo} value={metodo}>
              {METODOS[metodo]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <Label htmlFor="monto" className="text-xs text-muted-foreground">Monto a cobrar</Label>
          <Input
            id="monto"
            name="amountCop"
            inputMode="numeric"
            value={montoACobrar}
            onChange={(e) => setMontoACobrar(parseInt(e.target.value, 10) || 0)}
            required
            className="h-9 text-xs rounded-lg font-mono font-bold text-brand"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="entregado" className="text-xs text-muted-foreground">Recibido (efectivo)</Label>
          <Input
            id="entregado"
            name="tenderedCop"
            inputMode="numeric"
            placeholder="Opcional"
            className="h-9 text-xs rounded-lg font-mono"
          />
        </div>
      </div>

      <Enviar
        className="w-full bg-brand hover:bg-brand/90 text-brand-foreground font-bold text-xs h-10 rounded-xl shadow-xs gap-1.5"
        isPending={isPending}
      >
        <CreditCard className="size-3.5" />
        <span>Registrar pago</span>
      </Enviar>
    </form>
  );
}

/** Confirmar y enviar comanda a cocina. */
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

  let textoBoton = "Mandar comanda a cocina";
  if (isPending) {
    textoBoton = "Enviando a cocina…";
  } else if (turnNumber === null) {
    textoBoton = "Mandar comanda a cocina";
  } else if (tieneNuevosPendientes) {
    textoBoton =
      itemsSinEnviarCount === 1
        ? "Mandar 1 adición a cocina"
        : `Mandar adición a cocina (${itemsSinEnviarCount} ítems)`;
  } else {
    textoBoton = `Comanda en cocina (${formatTurno(turnNumber, 99, isMesa)})`;
  }

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <Button
        type="submit"
        size="lg"
        className={cn(
          "w-full font-bold shadow-xs gap-2 h-11 text-xs rounded-xl transition-all",
          yaEnviadoSinPendientes
            ? "bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80 font-medium"
            : "bg-brand hover:bg-brand/90 text-brand-foreground shadow-brand/20",
        )}
        disabled={isPending || yaEnviadoSinPendientes}
      >
        {yaEnviadoSinPendientes ? (
          <CheckCircle2 className="size-4 text-success" />
        ) : (
          <UtensilsCrossed className="size-4" />
        )}
        <span>{textoBoton}</span>
      </Button>
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
