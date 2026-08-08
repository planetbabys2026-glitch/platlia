"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Campo de contraseña con un ojo para mostrarla.
 *
 * Oculta por defecto, como cualquier contraseña, pero quien la elige tiene que
 * poder revisar que la escribió bien —de ahí el ojo, no solo el campo de
 * confirmación aparte— antes de mandar el formulario.
 */
export function CampoContrasena({
  label,
  name,
  errores,
  ayuda,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type"> & {
  label: string;
  name: string;
  errores?: string[];
  ayuda?: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const tieneError = Boolean(errores?.length);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          aria-invalid={tieneError || undefined}
          aria-describedby={cn(tieneError && idError, ayuda && idAyuda) || undefined}
          className={cn("pr-8", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-8 items-center justify-center"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
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
