"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { abrirPedido } from "@/features/pedidos/actions";
import type { MesaDelSalon } from "@/features/salon/queries";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Una mesa del salón.
 *
 * Con pedido abierto es un enlace a su cuenta; libre, un botón que abre uno. El
 * color viene de los tokens `mesa-*`, que son sólidos a propósito: en la tablet
 * de un bar a media luz, un estado translúcido deja de distinguirse.
 */

const COLOR: Record<string, string> = {
  LIBRE: "bg-mesa-libre",
  OCUPADA: "bg-mesa-ocupada",
  CUENTA_PEDIDA: "bg-mesa-cuenta",
  RESERVADA: "bg-mesa-reservada",
  INACTIVA: "bg-mesa-inactiva",
};

const ETIQUETA: Record<string, string> = {
  LIBRE: "Libre",
  OCUPADA: "Ocupada",
  CUENTA_PEDIDA: "Cuenta pedida",
  RESERVADA: "Reservada",
  INACTIVA: "Fuera de servicio",
};

function Cuadro({
  mesa,
  children,
  ...props
}: React.ComponentProps<"button"> & { mesa: MesaDelSalon; children?: React.ReactNode }) {
  return (
    <button
      type={props.type ?? "button"}
      {...props}
      className={cn(
        "border-border bg-card relative flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center transition-colors",
        "hover:bg-accent focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        props.className,
      )}
    >
      <span
        aria-hidden
        className={cn("absolute top-2 right-2 size-2.5 rounded-full", COLOR[mesa.status])}
      />
      <span className="numeral text-2xl leading-none font-semibold">{mesa.name}</span>
      {children}
    </button>
  );
}

export function Mesa({ mesa }: { mesa: MesaDelSalon }) {
  const router = useRouter();
  const [estado, accion] = useActionState(abrirPedido, ESTADO_INICIAL);
  const pedido = mesa.orders[0];

  // Al abrir el pedido se entra directo a su cuenta: el mesero ya está parado al
  // lado de la mesa esperando para cantar el primer producto.
  useEffect(() => {
    if (estado.ok && estado.data?.id) router.push(`/pedido/${estado.data.id}`);
  }, [estado, router]);

  if (pedido) {
    return (
      <a href={`/pedido/${pedido.id}`} className="block" aria-label={`Mesa ${mesa.name}`}>
        <Cuadro mesa={mesa} className="cursor-pointer">
          <span className="numeral text-muted-foreground text-xs">
            {formatCop(pedido.totalCop)}
          </span>
          <span className="text-muted-foreground text-[0.65rem]">
            {ETIQUETA[mesa.status]}
          </span>
        </Cuadro>
      </a>
    );
  }

  return (
    <form action={accion}>
      <input type="hidden" name="type" value="MESA" />
      <input type="hidden" name="tableId" value={mesa.id} />
      <BotonAbrir mesa={mesa} error={!estado.ok ? estado.error : undefined} />
    </form>
  );
}

function BotonAbrir({ mesa, error }: { mesa: MesaDelSalon; error?: string }) {
  const { pending } = useFormStatus();

  return (
    <Cuadro
      mesa={mesa}
      type="submit"
      disabled={pending || mesa.status === "INACTIVA"}
      title={error}
      aria-label={`Abrir pedido en la mesa ${mesa.name}`}
    >
      <span className="text-muted-foreground text-[0.65rem]">
        {pending ? "Abriendo…" : (error ?? ETIQUETA[mesa.status])}
      </span>
    </Cuadro>
  );
}
