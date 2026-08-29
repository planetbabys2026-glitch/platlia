"use client";

import { useActionState, useState } from "react";
import { Bot, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { autorizar } from "./acciones";

export type SedeAutorizable = { id: string; nombre: string };

/**
 * Lo que el dueño ve antes de decir que sí.
 *
 * Dice **quién** pide, **a qué sede** y **qué va a poder ver**, con el límite
 * escrito y no insinuado. Una pantalla de permisos que no dice qué se entrega
 * entrena a la gente a aprobar sin leer, y después el clic no significa nada.
 *
 * "Autorizar" no viene preseleccionado ni destacado por encima de "Cancelar" más
 * de lo justo: el que llega acá ya venía queriendo conectar, y lo que hay que
 * cuidar es que pueda frenar.
 */
export function FormularioAutorizar({
  aplicacion,
  destino,
  yaRegistrada,
  sedes,
  clientId,
  redirectUri,
  codeChallenge,
  state,
  urlDeCancelacion,
}: {
  aplicacion: string;
  /** El host al que va a volver el código. Es lo que hay que leer antes de aprobar. */
  destino: string;
  yaRegistrada: boolean;
  sedes: SedeAutorizable[];
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  urlDeCancelacion: string;
}) {
  const [estado, accion, pendiente] = useActionState(autorizar, null as { error?: string } | null);
  const [sede, setSede] = useState(sedes[0]!.id);

  return (
    <form action={accion} className="space-y-5">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="redirectUri" value={redirectUri} />
      <input type="hidden" name="codeChallenge" value={codeChallenge} />
      {state !== null && <input type="hidden" name="state" value={state} />}
      <input type="hidden" name="businessId" value={sede} />

      <div className="rounded-2xl border border-[var(--linea-16)] bg-[var(--panel-2)] p-4 space-y-3">
        <p className="flex items-center gap-2 font-mono text-rotulo uppercase tracking-[0.14em] text-brand">
          <Bot aria-hidden className="size-3.5" />
          Quién pide el acceso
        </p>
        <p className="text-base font-semibold text-foreground">{aplicacion}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Va a poder consultar tus ventas, tu inventario, tus horas de más movimiento y tus
          márgenes, y contestarte preguntándole.
        </p>
        {/* A dónde va el código es LO que hay que leer antes de aprobar: quien
            quiera robar el acceso puede llamar a su aplicación "Claude" y apuntarla
            a su propio servidor, y esto es lo único que lo delata. */}
        <p className="flex flex-wrap items-baseline gap-x-2 border-t border-[var(--linea-16)] pt-3 text-sm text-muted-foreground">
          Te va a devolver a
          <strong className="font-mono text-foreground">{destino}</strong>
        </p>
        {!yaRegistrada ? (
          <p className="text-sm text-muted-foreground">
            Es la primera vez que la vemos. Si no reconocés esa dirección, cancelá.
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[var(--linea-16)] bg-[var(--panel-2)] p-4 space-y-2">
        <p className="flex items-center gap-2 font-mono text-rotulo uppercase tracking-[0.14em] text-brand">
          <ShieldCheck aria-hidden className="size-3.5" />
          Qué NO va a poder hacer
        </p>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li>Cobrar, anular o cambiar cualquier cosa. Solo lee.</li>
          <li>Ver datos de tus clientes: ni nombres, ni teléfonos, ni direcciones.</li>
          <li>Entrar a otra sede que no sea la que elijas acá.</li>
        </ul>
      </div>

      {sedes.length > 1 ? (
        <fieldset className="space-y-2">
          {/* Con varias sedes hay que elegir una, y no hay opción por defecto que
              sea la correcta: el acceso es a la que se marque y a ninguna más. */}
          <legend className="mb-2 font-mono text-rotulo uppercase tracking-[0.14em] text-muted-foreground">
            ¿A cuál sede?
          </legend>
          {sedes.map((s) => (
            <label
              key={s.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors ${
                sede === s.id
                  ? "border-brand/60 bg-brand/10 text-foreground"
                  : "border-[var(--linea-16)] bg-[var(--input-bg)] text-muted-foreground hover:border-[var(--linea-30)]"
              }`}
            >
              <input
                type="radio"
                name="sede"
                className="sr-only"
                checked={sede === s.id}
                onChange={() => setSede(s.id)}
              />
              <span
                aria-hidden
                className={`grid size-4 shrink-0 place-items-center rounded-full border ${
                  sede === s.id ? "border-brand bg-brand" : "border-[var(--linea-30)]"
                }`}
              >
                {sede === s.id ? <Check className="size-2.5 text-brand-foreground" /> : null}
              </span>
              {s.nombre}
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">
          Se conecta a <strong className="text-foreground">{sedes[0]!.nombre}</strong>.
        </p>
      )}

      {estado?.error ? (
        <p role="alert" className="text-sm text-destructive-soft">
          {estado.error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button asChild variant="outline" className="flex-1">
          <a href={urlDeCancelacion}>Cancelar</a>
        </Button>
        <Button type="submit" disabled={pendiente} className="flex-1">
          {pendiente ? "Autorizando…" : "Autorizar"}
        </Button>
      </div>
    </form>
  );
}
