"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Campo de formulario con su etiqueta y su error.
 *
 * El error viene del estado que devuelve la Server Action, no de una validación
 * paralela en el cliente: si el mensaje que ve el usuario y la regla que corre en
 * el servidor son dos códigos distintos, tarde o temprano dicen cosas distintas.
 * El navegador igual valida `required` y `type` para el ida y vuelta obvio.
 */
export function Campo({
  label,
  name,
  errores,
  ayuda,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
  name: string;
  errores?: string[];
  ayuda?: string;
}) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const tieneError = Boolean(errores?.length);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        aria-invalid={tieneError || undefined}
        aria-describedby={cn(tieneError && idError, ayuda && idAyuda) || undefined}
        className={className}
        {...props}
      />
      {ayuda && !tieneError && (
        <p id={idAyuda} className="text-muted-foreground text-xs">
          {ayuda}
        </p>
      )}
      {tieneError && (
        <p id={idError} className="text-destructive text-xs">
          {errores?.[0]}
        </p>
      )}
    </div>
  );
}
