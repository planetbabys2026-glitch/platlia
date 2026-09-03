"use client";

import { useId, useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluarContrasena } from "@/lib/auth/reglas-contrasena";
import { cn } from "@/lib/utils";

/**
 * Campo de contraseña con un ojo para mostrarla.
 *
 * Oculta por defecto, como cualquier contraseña, pero quien la elige tiene que
 * poder revisar que la escribió bien —de ahí el ojo, no solo el campo de
 * confirmación aparte— antes de mandar el formulario.
 *
 * Con `requisitos`, además muestra la lista de lo que le falta a la contraseña
 * **mientras se escribe**. Va acá adentro y no copiada en cada formulario por
 * dos razones: es el único campo de contraseña del producto —lo usan el
 * registro, el restablecimiento, el alta de empleado y el equipo de
 * superadministración—, y la lista sale de `evaluarContrasena`, la misma
 * función que usa el esquema del servidor. Con una copia, tarde o temprano la
 * pantalla marcaría en verde algo que el servidor rechaza.
 */
export function CampoContrasena({
  label,
  name,
  errores,
  ayuda,
  requisitos,
  largoMinimo,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type"> & {
  label: string;
  name: string;
  errores?: string[];
  ayuda?: string;
  /** Mostrar la lista de requisitos mientras se escribe. Solo donde se CREA una
   *  contraseña: al ingresar no viene al caso. */
  requisitos?: boolean;
  /** El mínimo de largo, cuando no es el del producto (el superadministrador
   *  pide más). Va acá y no en la pantalla para que la lista no marque en verde
   *  a los 10 caracteres donde el servidor va a pedir 12. */
  largoMinimo?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [valor, setValor] = useState("");
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const tieneError = Boolean(errores?.length);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="font-mono text-rotulo uppercase tracking-[0.14em] text-muted-foreground font-semibold">
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
          onChange={(e) => {
            if (requisitos) setValor(e.target.value);
            props.onChange?.(e);
          }}
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
      {requisitos && <ListaDeRequisitos valor={valor} largoMinimo={largoMinimo} />}
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

/**
 * Qué le falta a la contraseña, ahora mismo.
 *
 * Se dibujan **los cinco siempre**, no solo los que faltan: una lista que
 * cambia de tamaño en cada tecla salta y no se puede leer. Lo que cambia es la
 * marca y el color.
 *
 * En vacío van todos en gris y no en rojo: todavía nadie escribió nada, así que
 * no hay nada que corregir —un formulario que abre en rojo se lee como si ya
 * hubiera fallado—.
 */
function ListaDeRequisitos({ valor, largoMinimo }: { valor: string; largoMinimo?: number }) {
  const items = evaluarContrasena(valor, largoMinimo);
  const vacio = valor.length === 0;

  return (
    <ul
      // `polite` y no `assertive`: esto tiene que acompañar a quien escribe, no
      // interrumpirlo en cada tecla.
      aria-live="polite"
      className="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-2"
    >
      {items.map((r) => {
        const cumple = r.cumple && !vacio;
        return (
          <li
            key={r.id}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              cumple ? "text-success-soft" : "text-muted-foreground",
            )}
          >
            {cumple ? (
              <Check className="size-3 shrink-0" aria-hidden />
            ) : (
              <X className={cn("size-3 shrink-0", vacio && "opacity-40")} aria-hidden />
            )}
            <span>{r.etiqueta}</span>
            <span className="sr-only">{cumple ? " (cumple)" : " (falta)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
