"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { abrirPedido } from "@/features/pedidos/actions";
import type { MesaDelSalon } from "@/features/salon/queries";
import { PantallaCargando } from "@/components/marca/loader";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Una mesa del salón.
 *
 * Libre es un botón que abre la primera cuenta y lleva derecho a ella: sentar una
 * mesa que va a tener una sola cuenta sigue siendo un toque, que es el 90% de las
 * veces. Ocupada es un enlace a la pantalla de la mesa, donde están sus cuentas
 * —una o varias— y desde donde se abre otra.
 *
 * El color viene de los tokens `mesa-*`, que son sólidos a propósito: en la
 * tablet de un bar a media luz, un estado translúcido deja de distinguirse.
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
        // `min-h` y no `aspect-square`: cuadrada, la mesa crecía con el ancho de
        // la columna, y en un teléfono terminaba midiendo 180px de alto para
        // mostrar un número de dos cifras.
        "group relative flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-border/80 bg-card p-3 text-center overflow-hidden",
        "transition-all duration-300 ease-out hover:border-brand/50 hover:shadow-xl hover:shadow-brand/10 hover:-translate-y-1.5 hover:scale-[1.04] active:scale-[0.96]",
        "focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        props.className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-2.5 right-2.5 size-3 rounded-full transition-transform duration-300 group-hover:scale-125 shadow-xs",
          COLOR[mesa.status],
        )}
      />
      <span className="font-display font-black text-2xl sm:text-3xl leading-none tracking-tight text-foreground transition-transform duration-300 group-hover:scale-110 group-hover:text-brand">
        {mesa.name}
      </span>
      {children}
    </button>
  );
}

export function Mesa({ mesa }: { mesa: MesaDelSalon }) {
  const router = useRouter();
  const [estado, accion, isPending] = useActionState(abrirPedido, ESTADO_INICIAL);
  const [enviando, setEnviando] = useState(false);
  const cuentas = mesa.cuentas.length;

  useEffect(() => {
    if (estado.ok && estado.data?.id) {
      router.push(`/pedido/${estado.data.id}`);
    } else if (!estado.ok && estado.error) {
      setEnviando(false);
    }
  }, [estado, router]);

  if (cuentas > 0) {
    return (
      <a
        href={`/salon/mesa/${mesa.id}`}
        className="block"
        aria-label={`Mesa ${mesa.name}`}
      >
        <Cuadro mesa={mesa} className="cursor-pointer">
          <span className="numeral text-muted-foreground text-xs">
            {formatCop(mesa.totalCop)}
          </span>
          <span className="text-muted-foreground text-rotulo">
            {cuentas > 1 ? `${cuentas} cuentas` : ETIQUETA[mesa.status]}
          </span>
        </Cuadro>
      </a>
    );
  }

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
    >
      <input type="hidden" name="type" value="MESA" />
      <input type="hidden" name="tableId" value={mesa.id} />
      <BotonAbrir mesa={mesa} error={!estado.ok ? estado.error : undefined} isPending={cargando} />
    </form>
  );
}

function BotonAbrir({ mesa, error, isPending }: { mesa: MesaDelSalon; error?: string; isPending?: boolean }) {
  const { pending } = useFormStatus();
  const cargando = pending || isPending;

  return (
    <>
      <PantallaCargando forcePending={cargando} />
      <Cuadro
        mesa={mesa}
        type="submit"
        disabled={cargando || mesa.status === "INACTIVA"}
        title={error}
        aria-label={`Abrir pedido en la mesa ${mesa.name}`}
      >
        <span className="text-muted-foreground text-rotulo">
          {cargando ? "Abriendo…" : (error ?? ETIQUETA[mesa.status])}
        </span>
      </Cuadro>
    </>
  );
}
