"use client";

import { useActionState, useState, useTransition } from "react";
import { Bot, Check, Copy, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { crearTokenIa, revocarTokenIa } from "@/features/ia/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatDateTimeInTimeZone } from "@/lib/time";

export type ConexionIa = {
  id: string;
  nombre: string;
  ultimoUsoEn: Date | null;
  createdAt: Date;
};

/**
 * Conectar la IA del negocio a su propia información.
 *
 * Lo que hace falta explicar acá no es cómo funciona el protocolo sino **qué se
 * está entregando**: una llave que deja leer ventas, costos y márgenes desde un
 * servicio de un tercero. Por eso el texto dice antes que nada qué puede y qué no
 * puede hacer quien la tenga.
 *
 * El token se muestra **una sola vez**. Después solo existe su hash, así que ni
 * nosotros podemos volver a mostrarlo: la pantalla lo deja a la vista con el
 * botón de copiar hasta que la persona lo cierra a propósito.
 */
export function FormularioIa({
  conexiones,
  urlMcp,
  sede,
  cantidadDeSedes,
  timeZone,
}: {
  conexiones: ConexionIa[];
  urlMcp: string;
  /** El nombre de ESTA sede. La conexión es suya y de ninguna otra. */
  sede: string;
  /** Cuántas sedes tiene la cuenta: con una sola, aclararlo sería ruido. */
  cantidadDeSedes: number;
  timeZone: string;
}) {
  const [estado, accion] = useActionState(crearTokenIa, ESTADO_INICIAL);
  const [nombre, setNombre] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [revocando, empezarRevocacion] = useTransition();

  const tokenNuevo = estado.ok && estado.data && "token" in estado.data ? estado.data.token : null;

  const copiar = async (texto: string, cual: string) => {
    await navigator.clipboard.writeText(texto);
    setCopiado(cual);
    toast.success("Copiado.");
    setTimeout(() => setCopiado(null), 2000);
  };

  const revocar = (id: string, nombreConexion: string) => {
    empezarRevocacion(async () => {
      const res = await revocarTokenIa(ESTADO_INICIAL, { tokenId: id });
      if (res.ok) toast.success(`Se cortó el acceso de "${nombreConexion}".`);
      else toast.error(res.error ?? "No se pudo revocar.");
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--linea-16)] bg-[var(--panel-2)] p-4 space-y-2">
        <p className="flex items-center gap-2 font-mono text-rotulo uppercase tracking-[0.14em] text-brand">
          <Bot aria-hidden className="size-3.5" />
          Qué puede ver tu IA
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Conectando esto, tu asistente puede responderte preguntas como{" "}
          <em className="text-foreground not-italic">&ldquo;¿cómo vendí esta semana?&rdquo;</em>,{" "}
          <em className="text-foreground not-italic">&ldquo;¿qué me falta comprar?&rdquo;</em> o{" "}
          <em className="text-foreground not-italic">&ldquo;¿a qué hora tengo más movimiento?&rdquo;</em>.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Es <strong className="text-foreground">solo de lectura</strong>: no puede cobrar, anular ni
          cambiar nada. Y <strong className="text-foreground">no ve datos de tus clientes</strong> —ni
          nombres, ni teléfonos, ni direcciones—: solo cifras del negocio.
        </p>
        {cantidadDeSedes > 1 ? (
          /**
           * Con más de una sede hay que decirlo, porque la dirección del servidor
           * es la misma en todas y lo único que las distingue es la llave: en el
           * cliente de IA las dos conexiones se ven iguales. Sin esta línea, un
           * dueño puede creer que con una alcanza y quedarse preguntando por qué
           * su asistente le contesta con los números de la otra sede.
           */
          <p className="text-sm leading-relaxed text-muted-foreground">
            Esta conexión es solo de{" "}
            <strong className="text-foreground">{sede}</strong>. Cada sede tiene la suya: si querés
            que tu asistente vea otra, entrá a esa sede y creale una llave propia.
          </p>
        ) : null}
      </div>

      {tokenNuevo ? (
        <div className="space-y-3 rounded-2xl border border-brand/50 bg-brand/5 p-4">
          <p className="flex items-center gap-2 font-mono text-rotulo uppercase tracking-[0.14em] text-brand">
            <TriangleAlert aria-hidden className="size-3.5" />
            Copialo ahora: no se vuelve a mostrar
          </p>
          <p className="text-sm text-muted-foreground">
            Guardamos solo una huella de esta llave, así que ni nosotros podemos volver a verla. Si la
            perdés, revocala y creá otra.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 py-2.5 font-mono text-xs text-foreground">
              {tokenNuevo}
            </code>
            <Button type="button" onClick={() => copiar(tokenNuevo, "token")} className="gap-1.5">
              {copiado === "token" ? <Check className="size-4" /> : <Copy className="size-4" />}
              Copiar
            </Button>
          </div>
        </div>
      ) : null}

      <form action={accion} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="nombre-ia">Nombre de la conexión</Label>
          <Input
            id="nombre-ia"
            name="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={cantidadDeSedes > 1 ? `Ej. ChatGPT — ${sede}` : "Ej. Mi ChatGPT"}
            required
            minLength={2}
          />
        </div>
        <Button type="submit" className="gap-1.5">
          <Plus className="size-4" />
          Crear conexión
        </Button>
      </form>

      {!estado.ok && estado.error ? (
        <p role="alert" className="text-sm text-destructive-soft">
          {estado.error}
        </p>
      ) : null}

      <div className="space-y-2.5">
        <p className="rotulo-seccion">
          <span className="shrink-0">
            Conexiones activas
            {" · "}
            <span className="numeral font-bold text-foreground">{conexiones.length}</span>
          </span>
        </p>

        {conexiones.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--linea-30)] p-6 text-center text-sm text-muted-foreground">
            Todavía no conectaste ninguna IA. Creá una conexión y pegá la dirección en tu asistente.
          </p>
        ) : (
          <ul className="space-y-2">
            {conexiones.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--linea-16)] bg-[var(--panel-2)] p-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{c.nombre}</p>
                  <p className="font-mono text-rotulo uppercase tracking-[0.12em] text-muted-foreground">
                    {c.ultimoUsoEn
                      ? `Se usó ${formatDateTimeInTimeZone(c.ultimoUsoEn, timeZone)}`
                      : "Todavía no se ha usado"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={revocando}
                  onClick={() => revocar(c.id, c.nombre)}
                  className="gap-1.5 border-destructive/40 text-destructive-soft hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                  Cortar acceso
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 rounded-2xl border border-[var(--linea-16)] bg-[var(--panel)] p-4">
        <p className="rotulo-seccion">
          <span className="shrink-0">Cómo conectarla</span>
        </p>
        <p className="text-sm text-muted-foreground">
          En tu asistente, agregá un servidor MCP con esta dirección y pegá la llave como token.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 py-2.5 font-mono text-xs text-foreground">
            {urlMcp}
          </code>
          <Button type="button" variant="outline" onClick={() => copiar(urlMcp, "url")} className="gap-1.5">
            {copiado === "url" ? <Check className="size-4" /> : <Copy className="size-4" />}
            Copiar
          </Button>
        </div>
      </div>
    </div>
  );
}
