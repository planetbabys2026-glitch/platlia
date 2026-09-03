"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  agregarSuperAdmin,
  editarSuperAdmin,
  quitarSuperAdmin,
  restablecerContrasenaSuperAdmin,
} from "@/features/superadmin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CampoContrasena } from "@/components/formulario/campo-contrasena";
import { LARGO_MINIMO_SUPERADMIN } from "@/lib/auth/reglas-contrasena";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

function Enviar({
  children,
  variant,
  size,
  className,
}: {
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending}>
      {pending ? "…" : children}
    </Button>
  );
}

function Aviso({ estado }: { estado: { ok: boolean; error?: string } }) {
  if (estado.ok || !estado.error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{estado.error}</AlertDescription>
    </Alert>
  );
}

export function AgregarSuperAdmin() {
  const [estado, accion] = useActionState(agregarSuperAdmin, ESTADO_INICIAL);
  const campos = !estado.ok ? estado.campos : undefined;

  return (
    <form action={accion} className="space-y-4">
      <Aviso estado={estado} />

      {estado.ok && (
        <Alert role="status">
          <AlertDescription>
            {estado.data.reutilizado
              ? "Ya tenía cuenta en Platlia: se le prendió el acceso de superadministrador con su contraseña de siempre."
              : "Listo. Pasale el correo y la contraseña para que entre por /superadmin/ingresar."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sa-name">Nombre</Label>
          <Input id="sa-name" name="name" required placeholder="Julián Ríos" />
          {campos?.name && <p className="text-destructive text-xs">{campos.name[0]}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sa-email">Correo</Label>
          <Input id="sa-email" name="email" type="email" required />
          {campos?.email && <p className="text-destructive text-xs">{campos.email[0]}</p>}
        </div>
      </div>

      <CampoContrasena
        label="Contraseña"
        name="password"
        required
        requisitos
        largoMinimo={LARGO_MINIMO_SUPERADMIN}
        ayuda="Esta cuenta ve todos los negocios, por eso pide más largo."
        errores={campos?.password}
      />

      <p className="text-muted-foreground text-xs">
        No se manda ninguna contraseña por correo: se la pasás vos y esa persona puede
        cambiarla después.
      </p>

      <Enviar>Agregar al equipo</Enviar>
    </form>
  );
}

function EditarInfo({
  userId,
  name,
  email,
  onListo,
}: {
  userId: string;
  name: string;
  email: string;
  onListo: () => void;
}) {
  const [estado, accion] = useActionState(editarSuperAdmin, ESTADO_INICIAL);
  const campos = !estado.ok ? estado.campos : undefined;

  // No se cierra durante el render: React no permite actualizar el estado del
  // padre mientras este componente todavía se está pintando.
  useEffect(() => {
    if (estado.ok) onListo();
  }, [estado, onListo]);

  return (
    <form action={accion} className="bg-muted/50 space-y-2 rounded-lg p-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`nombre-${userId}`} className="text-xs">
            Nombre
          </Label>
          <Input id={`nombre-${userId}`} name="name" defaultValue={name} required className="h-8 text-xs" />
          {campos?.name && <p className="text-destructive text-xs">{campos.name[0]}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`correo-${userId}`} className="text-xs">
            Correo
          </Label>
          <Input
            id={`correo-${userId}`}
            name="email"
            type="email"
            defaultValue={email}
            required
            className="h-8 text-xs"
          />
          {campos?.email && <p className="text-destructive text-xs">{campos.email[0]}</p>}
        </div>
      </div>
      <Aviso estado={estado} />
      <div className="flex items-center gap-2">
        <Enviar variant="outline" size="sm" className="h-8 text-xs">
          Guardar
        </Enviar>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={onListo}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function AccionesSuperAdmin({
  userId,
  name,
  email,
}: {
  userId: string;
  name: string;
  email: string;
}) {
  const [editando, setEditando] = useState(false);
  const [estadoClave, restablecer] = useActionState(restablecerContrasenaSuperAdmin, ESTADO_INICIAL);
  const [estadoQuitar, quitar] = useActionState(quitarSuperAdmin, ESTADO_INICIAL);

  if (editando) {
    return (
      <EditarInfo userId={userId} name={name} email={email} onListo={() => setEditando(false)} />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditando(true)}>
          Editar
        </Button>

        {/* Si esta es la última cuenta con acceso, el servidor la rechaza igual
            —lo dice el error de abajo—, pero eso solo puede pasar si "vos" no
            estás contado como superadministrador activo: un caso raro, no una
            trampa que valga la pena preveer con un botón deshabilitado. */}
        <form action={quitar}>
          <input type="hidden" name="userId" value={userId} />
          <Enviar variant="ghost" size="sm" className="text-destructive h-8 text-xs">
            Quitar acceso
          </Enviar>
        </form>
      </div>

      <form action={restablecer} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="userId" value={userId} />
        <Input
          name="password"
          type="password"
          required
          placeholder="Contraseña nueva"
          aria-label="Contraseña nueva"
          className="h-8 w-48 text-xs"
        />
        <Enviar variant="ghost" size="sm" className="h-8 text-xs">
          Restablecer
        </Enviar>
      </form>

      {[estadoClave, estadoQuitar].map(
        (e, i) =>
          !e.ok &&
          e.error && (
            <p key={i} className="text-destructive text-xs">
              {e.error}
            </p>
          ),
      )}
      {estadoClave.ok && (
        <p className="text-muted-foreground text-xs">
          Contraseña cambiada. Se le cerraron las sesiones abiertas.
        </p>
      )}
    </div>
  );
}
