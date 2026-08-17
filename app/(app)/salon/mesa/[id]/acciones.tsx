"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { abrirPedido, liberarMesa, renombrarCuenta } from "@/features/pedidos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PantallaCargando } from "@/components/ui/cargando-overlay";
import { Input } from "@/components/ui/input";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

/**
 * Las acciones de la pantalla de mesa.
 *
 * Mismo patrón que el resto del producto: `useActionState` + `<form action>` con
 * campos ocultos, y el botón como hijo para que `useFormStatus` lo vea.
 */

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

/**
 * Abre otra cuenta en la misma mesa.
 *
 * El nombre es obligatorio acá y no al sentar la mesa: la primera cuenta se abre
 * de un toque y se llama "Cuenta 1", pero desde la segunda el nombre es lo único
 * que distingue una comanda de otra en la cocina.
 */
export function NuevaCuenta({ tableId }: { tableId: string }) {
  const router = useRouter();
  const [estado, accion, isPending] = useActionState(abrirPedido, ESTADO_INICIAL);
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (estado.ok && estado.data?.id) {
      router.push(`/pedido/${estado.data.id}`);
    } else if (!estado.ok && estado.error) {
      setEnviando(false);
    }
  }, [estado, router]);

  const cargando = isPending || enviando;

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (cargando) {
          e.preventDefault();
          return;
        }
        setEnviando(true);
      }}
      className="flex flex-col gap-2 sm:flex-row sm:items-start"
    >
      <input type="hidden" name="type" value="MESA" />
      <input type="hidden" name="tableId" value={tableId} />
      <div className="flex-1 space-y-1">
        <Input
          name="customerName"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          disabled={cargando}
          maxLength={120}
          placeholder="¿A nombre de quién? (ej. Andrés)"
          aria-label="Nombre de la cuenta"
          className="h-11"
        />
        {!estado.ok && estado.error && (
          <p className="text-destructive text-xs">{estado.error}</p>
        )}
      </div>
      <Enviar className="h-11 shrink-0" isPending={cargando}>
        + Nueva cuenta
      </Enviar>
    </form>
  );
}

/** Le cambia el nombre a una cuenta ya abierta. */
export function RenombrarCuenta({
  orderId,
  customerName,
}: {
  orderId: string;
  customerName: string | null;
}) {
  const [estado, accion, isPending] = useActionState(renombrarCuenta, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex items-center gap-1.5">
      <input type="hidden" name="orderId" value={orderId} />
      <Input
        key={customerName ?? ""}
        name="customerName"
        defaultValue={customerName ?? ""}
        maxLength={120}
        placeholder="Nombre"
        aria-label="Nombre de la cuenta"
        className="h-9 flex-1 text-sm"
      />
      <Enviar variant="ghost" size="sm" className="h-9 shrink-0 text-xs" isPending={isPending}>
        Guardar
      </Enviar>
      {!estado.ok && estado.error && <span className="sr-only">{estado.error}</span>}
    </form>
  );
}

/** Cierra de una todas las cuentas vacías de la mesa. */
export function LiberarMesa({ tableId }: { tableId: string }) {
  const router = useRouter();
  const [estado, accion, isPending] = useActionState(liberarMesa, ESTADO_INICIAL);

  useEffect(() => {
    if (estado.ok) router.push("/salon");
  }, [estado.ok, router]);

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="tableId" value={tableId} />
      <Enviar variant="outline" className="h-11 w-full" isPending={isPending}>
        Liberar mesa
      </Enviar>
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
