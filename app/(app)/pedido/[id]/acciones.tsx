"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Minus, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import {
  anularItem,
  anularPedido,
  cambiarCantidad,
  confirmarPedido,
  ponerNotaItem,
  quitarItem,
} from "@/features/pedidos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatTurno } from "@/lib/turns";
import { cn } from "@/lib/utils";

function Enviar({
  children,
  variant,
  size,
  className,
  isPending,
  etiqueta,
}: {
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  isPending?: boolean;
  /** Para los botones que solo llevan un ícono adentro. */
  etiqueta?: string;
}) {
  const { pending } = useFormStatus();
  const cargando = pending || isPending;
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={cargando}
      aria-label={etiqueta}
    >
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
        {/* Un botón que solo lleva un ícono no tiene nombre accesible: ni el
            lector de pantalla ni una prueba pueden nombrarlo. */}
        <Enviar
          variant="outline"
          size="sm"
          className="size-6 p-0 rounded-xl"
          isPending={isPending}
          etiqueta="Quitar una unidad"
        >
          <Minus className="size-3" />
        </Enviar>
      </form>
      <span className="numeral w-6 text-center text-xs font-bold text-foreground">{quantity}</span>
      <form action={accion}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="quantity" value={quantity + 1} />
        <Enviar
          variant="outline"
          size="sm"
          className="size-6 p-0 rounded-xl"
          isPending={isPending}
          etiqueta="Agregar una unidad"
        >
          <Plus className="size-3" />
        </Enviar>
      </form>
    </span>
  );
}

/**
 * La nota de un renglón ("sin cebolla", "extra salsa").
 *
 * Se guarda sola al salir del campo. No hay botón: el que había no agregaba
 * nada —el `onBlur` ya había guardado antes de que nadie llegara a tocarlo— y
 * en la barra de acciones de un renglón cada botón de más es uno que se toca
 * sin querer con el pulgar.
 */
export function NotaRenglon({ itemId, notes }: { itemId: string; notes: string | null }) {
  const [estado, accion] = useActionState(ponerNotaItem, ESTADO_INICIAL);

  return (
    <form action={accion} className="pt-0.5">
      <input type="hidden" name="itemId" value={itemId} />
      <Input
        key={notes ?? ""}
        name="notes"
        defaultValue={notes ?? ""}
        placeholder="Nota de cocina (ej. sin cebolla, término medio…)"
        aria-label="Nota del renglón"
        maxLength={200}
        className="h-7 w-full text-xs rounded-xl bg-muted/30"
        onBlur={(e) => {
          if (e.target.value !== (notes ?? "")) {
            e.target.form?.requestSubmit();
          }
        }}
      />
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
        className="h-6 text-rotulo text-destructive hover:bg-destructive/10 px-1.5 gap-1 rounded-xl"
        isPending={isPending}
      >
        <Trash2 className="size-3" /> Quitar
      </Enviar>
      {!estado.ok && estado.error && <span className="sr-only">{estado.error}</span>}
    </form>
  );
}

export function AnularRenglon({
  itemId,
  pideClave = false,
}: {
  itemId: string;
  pideClave?: boolean;
}) {
  const [estado, accion, isPending] = useActionState(anularItem, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex flex-wrap items-center gap-1 pt-1">
      <input type="hidden" name="itemId" value={itemId} />
      <Input
        name="motivo"
        required
        minLength={3}
        placeholder="Motivo de anulación"
        aria-label="Motivo de la anulación"
        className="h-7 w-36 text-xs rounded-xl"
      />
      {pideClave && (
        <Input
          name="clave"
          type="password"
          required
          autoComplete="off"
          placeholder="Clave"
          aria-label="Clave de anulación"
          className="h-7 w-24 text-xs rounded-xl"
        />
      )}
      <Enviar variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:bg-destructive/10" isPending={isPending}>
        Anular
      </Enviar>
      {!estado.ok && estado.error && <span className="sr-only">{estado.error}</span>}
    </form>
  );
}

/** Anula el pedido entero con motivo justificado. */
/**
 * Anular el pedido entero.
 *
 * Lo puede hacer el MESERO —antes solo el cajero o el administrador, y eso dejaba
 * un pedido tomado por error abierto hasta que apareciera alguien con más rango,
 * con la mesa sin liberar y la caja sin poder cerrar—. El control pasó a ser la
 * clave que el propietario configure, no el rango de quien está parado ahí.
 */
export function AnularPedido({
  orderId,
  vacio,
  esMesa,
  pideClave = false,
}: {
  orderId: string;
  vacio: boolean;
  esMesa: boolean;
  /**
   * Si hay que pedir la clave.
   *
   * Solo cuando el pedido tiene consumo: uno vacío es una mesa abierta por error
   * y el servidor no la exige, así que mostrar el campo sería pedir algo que no
   * hace falta.
   */
  pideClave?: boolean;
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
          className="h-8 text-xs rounded-xl"
        />
        {pideClave && !vacio && (
          <Input
            name="clave"
            type="password"
            required
            autoComplete="off"
            placeholder="Clave"
            aria-label="Clave de anulación"
            className="h-8 w-24 text-xs rounded-xl shrink-0"
          />
        )}
        <Enviar
          variant="outline"
          size="sm"
          className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0 rounded-xl"
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
