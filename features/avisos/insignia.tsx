"use client";

import { cn } from "@/lib/utils";

/**
 * El número que lleva un ítem del menú: comandas vivas, domicilios en curso.
 *
 * En cero no se pinta nada. Un "0" permanente al lado de Cocina se vuelve
 * mobiliario en dos días y deja de leerse; lo que tiene que llamar la atención
 * es que aparezca.
 */
export function Insignia({
  valor,
  /** En la barra colapsada no hay lugar para el número: va un punto sobre el icono. */
  comoPunto = false,
  className,
}: {
  valor: number;
  comoPunto?: boolean;
  className?: string;
}) {
  if (valor <= 0) return null;

  if (comoPunto) {
    return (
      <span
        aria-hidden
        className={cn(
          "absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--brasa)] ring-2 ring-[var(--tinta)]",
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "numeral ml-auto shrink-0 rounded-full bg-[var(--brasa)] px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-[var(--tinta)]",
        className,
      )}
    >
      {valor > 99 ? "99+" : valor}
    </span>
  );
}
