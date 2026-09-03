"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Role } from "@/generated/prisma/enums";
import {
  agregarEmpleado,
  cambiarEstadoEmpleado,
  cambiarRol,
  mandarEnlaceDeContrasena,
  restablecerContrasena,
} from "@/features/equipo/actions";
import { CampoContrasena } from "@/components/formulario/campo-contrasena";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

export const ETIQUETA_ROL: Record<string, string> = {
  PROPIETARIO: "Propietario",
  ADMINISTRADOR: "Administrador",
  CAJERO: "Cajero",
  MESERO: "Mesero",
  COCINA: "Cocina",
};

/** El propietario no se ofrece en el alta: se asciende después, a conciencia. */
const ROLES_DE_ALTA = [Role.ADMINISTRADOR, Role.CAJERO, Role.MESERO, Role.COCINA];

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

function SelectRol({
  name,
  defaultValue,
  roles,
  id,
}: {
  name: string;
  defaultValue?: string;
  roles: string[];
  id: string;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      className="h-11 tableta:h-10 w-full rounded-lg border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 text-sm focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
    >
      {roles.map((rol) => (
        <option key={rol} value={rol}>
          {ETIQUETA_ROL[rol] ?? rol}
        </option>
      ))}
    </select>
  );
}

export function AgregarEmpleado() {
  const [estado, accion] = useActionState(agregarEmpleado, ESTADO_INICIAL);
  const campos = !estado.ok ? estado.campos : undefined;

  return (
    <form action={accion} className="space-y-4">
      <Aviso estado={estado} />

      {estado.ok && estado.data && (
        <Alert role="status">
          <AlertDescription>
            {estado.data.reactivado
              ? "Esa persona volvió al equipo."
              : estado.data.reutilizado
                ? "Ya tenía cuenta en Platlia: se sumó a este negocio con su contraseña de siempre."
                : "Listo. Pasale el correo y la contraseña para que entre."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="emp-name">Nombre</Label>
          <Input id="emp-name" name="name" required placeholder="Luisa Gómez" />
          {campos?.name && <p className="text-destructive text-xs">{campos.name[0]}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emp-role">Rol</Label>
          <SelectRol id="emp-role" name="role" defaultValue={Role.MESERO} roles={ROLES_DE_ALTA} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="emp-email">Correo</Label>
          <Input id="emp-email" name="email" type="email" required />
          {campos?.email && <p className="text-destructive text-xs">{campos.email[0]}</p>}
        </div>
        {/* Era un `<Input>` pelado con `minLength={8}`: la única pantalla del
            producto donde se crea una contraseña sin ver qué se le pide. Y es
            justo la de las cuentas que más manos tocan. */}
        <CampoContrasena
          label="Contraseña"
          name="password"
          autoComplete="new-password"
          required
          requisitos
          errores={campos?.password}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        No se manda ningún correo: la contraseña se la pasás vos y esa persona puede cambiarla
        después.
      </p>

      <Enviar>Agregar al equipo</Enviar>
    </form>
  );
}

export function AccionesMiembro({
  membershipId,
  role,
  active,
  puedeAscenderAPropietario,
  tieneCuentasFuera,
}: {
  membershipId: string;
  role: string;
  active: boolean;
  puedeAscenderAPropietario: boolean;
  /** Trabaja además en otro negocio, así que su contraseña no es solo de acá. */
  tieneCuentasFuera: boolean;
}) {
  const [estadoRol, cambiar] = useActionState(cambiarRol, ESTADO_INICIAL);
  const [estadoBaja, alternar] = useActionState(cambiarEstadoEmpleado, ESTADO_INICIAL);
  const [estadoClave, restablecer] = useActionState(restablecerContrasena, ESTADO_INICIAL);
  const [estadoEnlace, mandarEnlace] = useActionState(mandarEnlaceDeContrasena, ESTADO_INICIAL);

  const roles = puedeAscenderAPropietario
    ? [Role.PROPIETARIO, ...ROLES_DE_ALTA]
    : ROLES_DE_ALTA;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={cambiar} className="flex items-center gap-1">
          <input type="hidden" name="membershipId" value={membershipId} />
          <SelectRol
            id={`rol-${membershipId}`}
            name="role"
            defaultValue={role}
            roles={roles}
          />
          <Enviar variant="outline" size="sm" className="h-11 tableta:h-10">
            Cambiar
          </Enviar>
        </form>

        <form action={alternar}>
          <input type="hidden" name="membershipId" value={membershipId} />
          <input type="hidden" name="active" value={String(!active)} />
          <Enviar variant="ghost" size="sm">
            {active ? "Dar de baja" : "Reactivar"}
          </Enviar>
        </form>
      </div>

      {/* A quien trabaja además en otro negocio no se le puede escribir la
          contraseña: `User.passwordHash` es de la persona, no de este negocio, y
          cambiárselo acá le entregaría al que la escribe la llave de su otro
          trabajo. La acción lo rechaza; la pantalla no ofrece el campo, para no
          poner un botón que siempre falla.

          No se dice DÓNDE más trabaja: eso es asunto de esa persona. */}
      {tieneCuentasFuera ? (
        <form action={mandarEnlace} className="space-y-1">
          <input type="hidden" name="membershipId" value={membershipId} />
          <Enviar variant="ghost" size="sm" className="h-11 tableta:h-8 text-xs">
            Mandar enlace de contraseña
          </Enviar>
          <p className="text-muted-foreground text-xs">
            Usa el mismo correo en otro negocio de Platlia, así que su contraseña no es solo
            de acá: la elige por correo.
          </p>
        </form>
      ) : (
        <form action={restablecer} className="flex flex-wrap items-center gap-1">
          <input type="hidden" name="membershipId" value={membershipId} />
          <Input
            name="password"
            type="password"
            required
            placeholder="Contraseña nueva"
            aria-label="Contraseña nueva"
            className="h-11 tableta:h-8 w-44 text-xs"
          />
          <Enviar variant="ghost" size="sm" className="h-11 tableta:h-8 text-xs">
            Restablecer
          </Enviar>
        </form>
      )}

      {[estadoRol, estadoBaja, estadoClave, estadoEnlace].map(
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
      {estadoEnlace.ok && estadoEnlace.data && (
        <p className="text-muted-foreground text-xs">
          Le mandamos el enlace a {estadoEnlace.data.correo}. Vence en una hora.
        </p>
      )}
    </div>
  );
}
