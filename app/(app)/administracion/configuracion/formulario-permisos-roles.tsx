"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  BarChart3,
  Bike,
  BookOpen,
  Boxes,
  Calculator,
  CheckCircle2,
  ChefHat,
  CreditCard,
  LayoutGrid,
  MonitorPlay,
  RotateCcw,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Role } from "@/generated/prisma/enums";
import { guardarPermisosRoles } from "@/features/negocio/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import {
  INFO_ROLES,
  PERMISOS_POR_DEFECTO,
  ROLES_CONFIGURABLES,
  SECCIONES_SISTEMA,
  parsearPermisosPersonalizados,
  type SeccionPermiso,
} from "@/lib/auth/permisos-roles";
import { cn } from "@/lib/utils";

const ICONOS_SECCION: Record<SeccionPermiso, React.ElementType> = {
  salon_pos: LayoutGrid,
  pos: Calculator,
  cocina: ChefHat,
  caja: CreditCard,
  domicilios: Bike,
  turnero: MonitorPlay,
  inventario: Boxes,
  informes: BarChart3,
  carta: BookOpen,
  salon_plano: LayoutGrid,
  equipo: Users,
  configuracion: Settings,
};

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="font-bold">
      {pending ? "Guardando permisos…" : "Guardar permisos de roles"}
    </Button>
  );
}

export function FormularioPermisosRoles({
  rolePermissionsRaw,
}: {
  rolePermissionsRaw?: string | null;
}) {
  const [estado, accion] = useActionState(guardarPermisosRoles, ESTADO_INICIAL);
  const [rolActivo, setRolActivo] = useState<(typeof ROLES_CONFIGURABLES)[number]>(Role.MESERO);

  // Estado local para edición interactiva
  const [permisosPorRol, setPermisosPorRol] = useState<
    Record<(typeof ROLES_CONFIGURABLES)[number], Record<SeccionPermiso, boolean>>
  >(() => {
    const personalizados = parsearPermisosPersonalizados(rolePermissionsRaw);
    const resultado: Record<(typeof ROLES_CONFIGURABLES)[number], Record<SeccionPermiso, boolean>> = {
      [Role.ADMINISTRADOR]: {
        ...PERMISOS_POR_DEFECTO[Role.ADMINISTRADOR],
        ...(personalizados[Role.ADMINISTRADOR] ?? {}),
      },
      [Role.CAJERO]: {
        ...PERMISOS_POR_DEFECTO[Role.CAJERO],
        ...(personalizados[Role.CAJERO] ?? {}),
      },
      [Role.MESERO]: {
        ...PERMISOS_POR_DEFECTO[Role.MESERO],
        ...(personalizados[Role.MESERO] ?? {}),
      },
      [Role.COCINA]: {
        ...PERMISOS_POR_DEFECTO[Role.COCINA],
        ...(personalizados[Role.COCINA] ?? {}),
      },
    };
    return resultado;
  });

  const togglePermiso = (seccion: SeccionPermiso) => {
    setPermisosPorRol((prev) => ({
      ...prev,
      [rolActivo]: {
        ...prev[rolActivo],
        [seccion]: !prev[rolActivo][seccion],
      },
    }));
  };

  const restablecerDefaultsRol = () => {
    setPermisosPorRol((prev) => ({
      ...prev,
      [rolActivo]: {
        ...PERMISOS_POR_DEFECTO[rolActivo],
      },
    }));
  };

  const habilitarTodasRol = (habilitar: boolean) => {
    const nuevoMap = {} as Record<SeccionPermiso, boolean>;
    for (const sec of SECCIONES_SISTEMA) {
      nuevoMap[sec.id] = habilitar;
    }
    setPermisosPorRol((prev) => ({
      ...prev,
      [rolActivo]: nuevoMap,
    }));
  };

  // Preparar JSON serializado para enviar
  const jsonFinal = JSON.stringify(permisosPorRol);

  const categorias = ["Operación", "Gestión", "Administración"] as const;
  const permisosActuales = permisosPorRol[rolActivo];
  const defaultsRol = PERMISOS_POR_DEFECTO[rolActivo];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="size-5 text-brand" />
          Control de acceso y visibilidad por rol
        </h2>
        <p className="text-xs text-muted-foreground">
          Configurá qué secciones y módulos puede ver cada rol en esta sede. El{" "}
          <strong>Propietario</strong> siempre tiene acceso total sin restricciones.
        </p>
      </div>

      {/* Selector de Roles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ROLES_CONFIGURABLES.map((rol) => {
          const info = INFO_ROLES[rol];
          const esSeleccionado = rolActivo === rol;
          const activosCount = Object.values(permisosPorRol[rol]).filter(Boolean).length;

          return (
            <button
              key={rol}
              type="button"
              onClick={() => setRolActivo(rol)}
              className={cn(
                "p-3 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2",
                esSeleccionado
                  ? "bg-card border-brand shadow-sm ring-1 ring-brand/30"
                  : "bg-[var(--panel-2)] border-border/60 hover:border-border hover:bg-card text-muted-foreground"
              )}
            >
              <div className="flex items-center justify-between gap-1 w-full">
                <span className={cn("font-bold text-xs", esSeleccionado ? "text-foreground" : "")}>
                  {info.nombre}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-rotulo font-mono px-1.5 py-0 h-4",
                    esSeleccionado ? "border-brand/40 text-brand font-bold" : ""
                  )}
                >
                  {activosCount}/{SECCIONES_SISTEMA.length}
                </Badge>
              </div>
              <span className="text-rotulo text-muted-foreground block truncate">
                {info.insignia}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cabecera del Rol Seleccionado */}
      <div className="p-4 rounded-2xl bg-[var(--panel-2)] border border-border/80 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-foreground">
              Permisos para: {INFO_ROLES[rolActivo].nombre}
            </span>
            <Badge variant="outline" className="text-rotulo">
              {INFO_ROLES[rolActivo].insignia}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {INFO_ROLES[rolActivo].descripcion}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={restablecerDefaultsRol}
            className="h-8 text-xs font-semibold rounded-xl gap-1.5 border-border hover:bg-muted text-foreground"
            title="Restablecer a la configuración recomendada por defecto para este rol"
          >
            <RotateCcw className="size-3 text-muted-foreground" />
            <span>Valores por defecto</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => habilitarTodasRol(true)}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            Habilitar todas
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => habilitarTodasRol(false)}
            className="h-8 text-xs text-muted-foreground hover:text-destructive"
          >
            Deshabilitar todas
          </Button>
        </div>
      </div>

      {/* Matriz de Permisos por Categoría */}
      <div className="space-y-5">
        {categorias.map((cat) => {
          const seccionesCat = SECCIONES_SISTEMA.filter((s) => s.categoria === cat);

          return (
            <div key={cat} className="space-y-2.5">
              <div className="flex items-center gap-2 font-mono text-rotulo tracking-[0.14em] uppercase text-muted-foreground">
                <span>{cat}</span>
                <span className="flex-1 border-t border-dashed border-border/80" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {seccionesCat.map((seccion) => {
                  const Icono = ICONOS_SECCION[seccion.id];
                  const estaActivo = Boolean(permisosActuales[seccion.id]);
                  const esDefault = defaultsRol[seccion.id];
                  const esPersonalizado = estaActivo !== esDefault;

                  return (
                    <div
                      key={seccion.id}
                      onClick={() => togglePermiso(seccion.id)}
                      className={cn(
                        "group flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer select-none",
                        estaActivo
                          ? "bg-card border-brand/40 shadow-xs hover:border-brand"
                          : "bg-[var(--panel-2)]/60 border-border/60 opacity-65 hover:opacity-100 hover:border-border"
                      )}
                    >
                      <div
                        className={cn(
                          "size-8 rounded-xl flex items-center justify-center shrink-0 transition-colors mt-0.5",
                          estaActivo
                            ? "bg-brand/10 text-brand"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Icono className="size-4" />
                      </div>

                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs text-foreground block truncate">
                            {seccion.nombre}
                          </span>
                          {esPersonalizado && (
                            <Badge
                              variant="outline"
                              className="text-rotulo font-medium border-warning/40 bg-warning/10 text-warning-soft px-1.5 py-0 shrink-0"
                            >
                              Personalizado
                            </Badge>
                          )}
                        </div>
                        <p className="text-rotulo text-muted-foreground line-clamp-2 leading-relaxed">
                          {seccion.descripcion}
                        </p>
                      </div>

                      <div className="pt-0.5 shrink-0">
                        <input
                          type="checkbox"
                          checked={estaActivo}
                          onChange={() => {}} // controlado por onClick del contenedor
                          className="size-4 rounded accent-[var(--brasa)] cursor-pointer"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Formulario de Envío */}
      <form action={accion} className="space-y-4 pt-3 border-t border-border/80">
        <input type="hidden" name="rolePermissions" value={jsonFinal} />

        {estado.ok && (
          <Alert className="border-success/40 bg-success/10 text-success-soft rounded-2xl">
            <CheckCircle2 className="size-4" />
            <AlertDescription className="text-xs font-semibold">
              Permisos de roles guardados correctamente. El menú y las vistas de cada empleado se han actualizado.
            </AlertDescription>
          </Alert>
        )}

        {!estado.ok && estado.error && (
          <Alert variant="destructive" role="alert" className="rounded-2xl text-xs">
            <AlertDescription>{estado.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-rotulo text-muted-foreground">
            Los cambios se aplican de inmediato en la sesión de cada usuario.
          </p>
          <Enviar />
        </div>
      </form>
    </div>
  );
}
