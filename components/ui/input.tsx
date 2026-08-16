import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // El pozo: el campo tiene que ser MÁS oscuro que el panel que lo contiene.
        // Antes era `bg-input/20`, y como `--input` es `--linea-16`, eso daba un
        // beige al ~3%: el campo no se distinguía del fondo. Los tokens correctos
        // (`--input-bg` / `--input-bg-focus`) estaban definidos y sin usar.
        "h-11 w-full min-w-0 rounded-lg border border-[var(--linea-16)] bg-[var(--input-bg)] px-3.5 py-2 text-base tableta:text-sm text-foreground transition-all outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[var(--linea-30)] focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
