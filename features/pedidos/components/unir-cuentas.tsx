"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Merge } from "lucide-react";
import { unirCuentas } from "@/features/pedidos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";

/**
 * Juntar varias cuentas en una sola.
 *
 * El caso es un grupo repartido en tres mesas donde una persona paga todo. Sin
 * esto son tres cobros, tres tiquetes y —si piden factura electrónica— tres
 * documentos ante la DIAN por una sola venta.
 *
 * **Hay que elegir cuál se queda con todo, y no hay opción por defecto correcta.**
 * El número de esa cuenta es el que va a salir en el tiquete y el que la gente va
 * a cantar, así que se pregunta en vez de suponer la primera.
 */

export type CuentaUnible = {
  id: string;
  code: number;
  etiqueta: string;
  /** De qué mesa viene, cuando se une desde una pantalla que mezcla varias. */
  mesa?: string | null;
  totalCop: number;
};

export function UnirCuentas({
  cuentas,
  titulo = "Unir cuentas",
}: {
  cuentas: CuentaUnible[];
  titulo?: string;
}) {
  const [estado, accion] = useActionState(unirCuentas, ESTADO_INICIAL);
  const [abierto, setAbierto] = useState(false);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [destino, setDestino] = useState<string | null>(null);

  // Con una sola cuenta no hay nada que unir, y el botón sería una promesa vacía.
  if (cuentas.length < 2) return null;

  const alternar = (id: string) => {
    setElegidas((previas) => {
      const siguientes = previas.includes(id)
        ? previas.filter((x) => x !== id)
        : [...previas, id];
      // El destino tiene que seguir siendo una de las elegidas, y arranca en la
      // primera que se marca: el servidor rechaza cualquier otra cosa.
      setDestino((actual) =>
        actual && siguientes.includes(actual) ? actual : (siguientes[0] ?? null),
      );
      return siguientes;
    });
  };

  const total = cuentas
    .filter((c) => elegidas.includes(c.id))
    .reduce((suma, c) => suma + c.totalCop, 0);

  if (!abierto) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(true)}>
        <Merge className="size-4" />
        {titulo}
      </Button>
    );
  }

  return (
    <form action={accion} className="space-y-3 rounded-xl border border-border/80 p-3">
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <p className="text-sm text-muted-foreground text-pretty">
        Marcá las cuentas que se pagan juntas y elegí cuál se queda con todo. Las
        otras quedan cerradas y su consumo pasa a esa.
      </p>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border/80">
        {cuentas.map((cuenta) => {
          const marcada = elegidas.includes(cuenta.id);
          return (
            <li key={cuenta.id} className="flex flex-wrap items-center gap-3 bg-card p-3">
              <label className="flex flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  name="orderIds"
                  value={cuenta.id}
                  checked={marcada}
                  onChange={() => alternar(cuenta.id)}
                  className="size-4"
                />
                <span className="flex-1">
                  <span className="font-semibold text-foreground">
                    {cuenta.mesa ? `${cuenta.mesa} · ` : ""}
                    {cuenta.etiqueta}
                  </span>
                  <span className="ml-2 text-rotulo text-muted-foreground">#{cuenta.code}</span>
                </span>
                <span className="numeral font-bold">{formatCop(cuenta.totalCop)}</span>
              </label>

              {/* Cuál se queda con todo: su número es el que va a salir en el
                  tiquete. Solo aparece sobre lo marcado, porque elegir el destino
                  entre cuentas que no participan no significa nada. */}
              {marcada && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="radio"
                    name="destinoOrderId"
                    value={cuenta.id}
                    checked={destino === cuenta.id}
                    onChange={() => setDestino(cuenta.id)}
                    className="size-4"
                  />
                  Se queda con todo
                </label>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Unir deshabilitado={elegidas.length < 2 || !destino} />
        <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
        {elegidas.length >= 2 && (
          <span className="text-sm text-muted-foreground">
            {elegidas.length} cuentas ·{" "}
            <span className="numeral font-bold text-foreground">{formatCop(total)}</span>
          </span>
        )}
      </div>
    </form>
  );
}

function Unir({ deshabilitado }: { deshabilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || deshabilitado}>
      {pending ? "Uniendo…" : "Unir en una cuenta"}
    </Button>
  );
}
