"use client";

import { useState, useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { elegirNegocio } from "@/features/auth/actions";
import { crearSucursalAdicional } from "@/features/negocio/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { Store, Plus, Building2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export type NegocioElegible = {
  id: string;
  name: string;
  role: string;
  activo: boolean;
};

function Opcion({ negocio }: { negocio: NegocioElegible }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      name="businessId"
      value={negocio.id}
      variant="outline"
      className="h-auto w-full justify-between p-4 rounded-2xl border-border/80 hover:border-brand hover:bg-brand/5 text-left transition-all"
      disabled={pending || !negocio.activo}
    >
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold shrink-0">
          <Store className="size-5" />
        </div>
        <div>
          <span className="font-bold text-sm text-foreground block">{negocio.name}</span>
          <span className="text-muted-foreground text-xs font-normal">
            Rol: <strong className="text-foreground capitalize">{negocio.role.toLowerCase()}</strong>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {negocio.activo ? (
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs font-semibold">
            Entrar
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-xs">
            Suspendido
          </Badge>
        )}
      </div>
    </Button>
  );
}

export function SelectorNegocio({ negocios }: { negocios: NegocioElegible[] }) {
  const [estado, accion] = useActionState(elegirNegocio, ESTADO_INICIAL);
  const [mostrarModalCrear, setMostrarModalCrear] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [nombreSucursal, setNombreSucursal] = useState("");
  const [direccion, setDireccion] = useState("");
  const [telefono, setTelefono] = useState("");

  const esPropietario = negocios.some((n) => n.role === "PROPIETARIO");

  const handleCrearSucursal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreSucursal.trim()) {
      toast.error("Escribí el nombre de la sucursal.");
      return;
    }

    startTransition(async () => {
      const res = await crearSucursalAdicional(undefined, {
        name: nombreSucursal,
        address: direccion || undefined,
        phone: telefono || undefined,
      });

      if (res.ok) {
        toast.success(`¡Sucursal "${nombreSucursal}" creada con éxito!`);
        setMostrarModalCrear(false);
        setNombreSucursal("");
        setDireccion("");
        setTelefono("");
        // Entrar directamente a la nueva sucursal
        const form = new FormData();
        form.append("businessId", res.data.id);
        startTransition(() => {
          accion(form);
        });
      } else {
        toast.error(res.error || "Ocurrió un error al crear la sucursal.");
      }
    });
  };

  return (
    <div className="space-y-4">
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      {/* Lista de sucursales del propietario / usuario */}
      <ul className="space-y-3">
        {negocios.map((negocio) => (
          <li key={negocio.id}>
            <form action={accion}>
              <Opcion negocio={negocio} />
            </form>
          </li>
        ))}
      </ul>

      {/* Botón de Solicitar / Crear Nueva Sucursal Adicional */}
      {esPropietario && (
        <div className="pt-3 border-t border-border">
          {!mostrarModalCrear ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setMostrarModalCrear(true)}
              className="w-full h-12 rounded-2xl border-dashed border-brand/50 text-brand dark:text-brand-accent hover:bg-brand/10 font-bold gap-2 text-xs sm:text-sm"
            >
              <Plus className="size-4" />
              ➕ Crear / Solicitar Nueva Sucursal
            </Button>
          ) : (
            <form
              onSubmit={handleCrearSucursal}
              className="p-5 rounded-2xl border border-brand/40 bg-card shadow-lg space-y-4 animate-in fade-in duration-200"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-brand dark:text-brand-accent" />
                  <h3 className="font-bold text-sm text-foreground">Nueva Sucursal Independiente</h3>
                </div>
                <Badge variant="outline" className="text-[10px] bg-brand/10 text-brand font-bold">
                  7 Días de Prueba
                </Badge>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Cada sucursal opera de forma 100% independiente con sus propias mesas, comandas, menú QR, turnero, caja e inventario.
              </p>

              <div className="space-y-3">
                <div className="space-y-1 text-left">
                  <Label htmlFor="nombreSucursal" className="text-xs font-semibold">
                    Nombre de la Sucursal *
                  </Label>
                  <Input
                    id="nombreSucursal"
                    placeholder="Ej: Platlia Poblado / Saja Laureles"
                    value={nombreSucursal}
                    onChange={(e) => setNombreSucursal(e.target.value)}
                    className="h-10 text-xs rounded-xl"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-left">
                  <div className="space-y-1">
                    <Label htmlFor="direccion" className="text-xs font-semibold">
                      Dirección
                    </Label>
                    <Input
                      id="direccion"
                      placeholder="Ej: Cra 70 # 45-12"
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="telefono" className="text-xs font-semibold">
                      Teléfono
                    </Label>
                    <Input
                      id="telefono"
                      placeholder="Ej: 300 123 4567"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMostrarModalCrear(false)}
                  disabled={isPending}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending}
                  className="bg-brand text-white font-bold text-xs gap-1.5 h-10 px-4 rounded-xl shadow-md"
                >
                  {isPending ? "Creando sucursal..." : "Crear e Ingresar a Sucursal"}
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
