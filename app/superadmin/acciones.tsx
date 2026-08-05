"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { extenderLicencia, suspenderEmpresa } from "@/features/superadmin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

function Enviar({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" className="h-8 text-xs" disabled={pending}>
      {pending ? "…" : children}
    </Button>
  );
}

/**
 * Toda acción de soporte pide motivo.
 *
 * No es burocracia: suspender un negocio o regalarle un mes son cosas que
 * después alguien pregunta por qué se hicieron, y la respuesta tiene que estar
 * escrita en la bitácora junto con quién lo hizo.
 */
export function AccionesNegocio({
  businessId,
  suspendido,
}: {
  businessId: string;
  suspendido: boolean;
}) {
  const [estadoSusp, suspender] = useActionState(suspenderEmpresa, ESTADO_INICIAL);
  const [estadoExt, extender] = useActionState(extenderLicencia, ESTADO_INICIAL);

  return (
    <div className="space-y-2">
      <form action={suspender} className="flex flex-wrap items-center gap-1">
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="suspender" value={String(!suspendido)} />
        <Input
          name="motivo"
          required
          minLength={3}
          placeholder="Motivo"
          aria-label="Motivo"
          className="h-8 w-40 text-xs"
        />
        <Enviar>{suspendido ? "Reactivar" : "Suspender"}</Enviar>
      </form>

      <form action={extender} className="flex flex-wrap items-center gap-1">
        <input type="hidden" name="businessId" value={businessId} />
        <Input
          name="dias"
          type="number"
          min={1}
          max={365}
          defaultValue={30}
          aria-label="Días a extender"
          className="h-8 w-16 text-xs"
        />
        <Input
          name="motivo"
          required
          minLength={3}
          placeholder="Motivo"
          aria-label="Motivo de la extensión"
          className="h-8 w-40 text-xs"
        />
        <Enviar>Extender licencia</Enviar>
      </form>

      {[estadoSusp, estadoExt].map(
        (e, i) =>
          !e.ok &&
          e.error && (
            <p key={i} className="text-destructive text-xs">
              {e.error}
            </p>
          ),
      )}
    </div>
  );
}
