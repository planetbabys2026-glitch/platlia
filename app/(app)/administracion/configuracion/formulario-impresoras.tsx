"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import {
  borrarAgenteDeImpresion,
  borrarImpresora,
  crearAgenteDeImpresion,
  guardarComandaDestino,
  guardarImpresora,
  guardarRutasDeImpresion,
  imprimirPrueba,
  regenerarTokenDeAgente,
} from "@/features/negocio/impresion-actions";
import { formatDateTimeInTimeZone } from "@/lib/time";
import { cn } from "@/lib/utils";

export type ImpresoraPlana = {
  id: string;
  name: string;
  rol: string;
  host: string;
  port: number;
  width: string;
  abreCajon: boolean;
  active: boolean;
};

export type ConfiguracionImpresionProps = {
  impresoras: ImpresoraPlana[];
  rutas: { stationName: string; printerId: string }[];
  agentes: { id: string; nombre: string; ultimoContactoEn: Date | null; createdAt: Date }[];
  estaciones: string[];
  pendientes: number;
  fallidos: {
    id: string;
    tipo: string;
    ultimoError: string | null;
    updatedAt: Date;
    printer: { name: string };
  }[];
  comandaDestino: string;
  timeZone: string;
  /** Qué ejecutables están compilados y listos para bajar. */
  descargas: { so: "windows" | "linux" | "mac"; etiqueta: string; url: string; disponible: boolean }[];
};

const IMPRESORA_NUEVA: ImpresoraPlana = {
  id: "",
  name: "",
  rol: "RECIBO",
  host: "192.168.1.50",
  port: 9100,
  width: "MM80",
  abreCajon: false,
  active: true,
};

/** Si el agente dio señales hace poco, está andando. */
function estadoDelAgente(ultimo: Date | null): { texto: string; clase: string } {
  if (!ultimo) return { texto: "Nunca se conectó", clase: "bg-muted text-muted-foreground" };
  const minutos = (Date.now() - new Date(ultimo).getTime()) / 60_000;
  if (minutos < 2) return { texto: "Conectado", clase: "bg-success/15 text-success-soft" };
  if (minutos < 60) return { texto: "Hace un rato", clase: "bg-warning/15 text-warning-soft" };
  return { texto: "Sin conexión", clase: "bg-destructive/15 text-destructive-soft" };
}

export function FormularioImpresoras({
  impresoras,
  rutas,
  agentes,
  estaciones,
  pendientes,
  fallidos,
  comandaDestino,
  timeZone,
  descargas,
}: ConfiguracionImpresionProps) {
  const [editando, setEditando] = useState<ImpresoraPlana | null>(null);
  const [codigoNuevo, setCodigoNuevo] = useState<string | null>(null);
  const [nombreAgente, setNombreAgente] = useState("PC de la caja");
  const [destino, setDestino] = useState(comandaDestino);
  const [mapa, setMapa] = useState<Record<string, string>>(
    Object.fromEntries(rutas.map((r) => [r.stationName, r.printerId])),
  );
  const [pendiente, iniciar] = useTransition();

  /**
   * El sistema de la máquina desde la que se está mirando.
   *
   * Se destaca ese botón y nada más: quien configura una caja está sentado en esa
   * caja, y hacerle elegir entre tres archivos parecidos es la forma más fácil de
   * que se baje el que no es.
   */
  const hayDescargas = descargas.some((d) => d.disponible);

  const soDetectado: "windows" | "linux" | "mac" | null =
    typeof navigator === "undefined"
      ? null
      : /Win/i.test(navigator.platform)
        ? "windows"
        : /Mac/i.test(navigator.platform)
          ? "mac"
          : /Linux/i.test(navigator.platform)
            ? "linux"
            : null;

  const copiar = async (texto: string, que: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${que} copiado.`);
    } catch {
      toast.error("No pude copiar. Seleccionalo y copialo a mano.");
    }
  };

  const correr = (fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) =>
    iniciar(async () => {
      const res = await fn();
      if (res.ok) toast.success(exito);
      else toast.error(res.error ?? "No se pudo.");
    });

  const impresorasDeComanda = impresoras.filter((i) => i.rol === "COMANDA");

  return (
    <div className="space-y-6">
      {/* ── Cómo sale la comanda ───────────────────────────────────────────── */}
      <section className="space-y-2 rounded-xl border border-border p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">¿Cómo llega el pedido a la cocina?</h3>
          <p className="text-xs text-muted-foreground">
            La pantalla del KDS no le sirve a todas las cocinas. Con papel, cada estación
            imprime lo suyo en la impresora que le asignes abajo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {(
            [
              { id: "KDS", label: "Solo pantalla (KDS)" },
              { id: "IMPRESA", label: "Solo papel" },
              { id: "AMBAS", label: "Pantalla y papel" },
            ] as const
          ).map((op) => (
            <button
              key={op.id}
              type="button"
              onClick={() => {
                setDestino(op.id);
                correr(
                  () => guardarComandaDestino(ESTADO_INICIAL, { comandaDestino: op.id }),
                  "Listo.",
                );
              }}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-semibold transition-all",
                destino === op.id
                  ? "bg-brand text-brand-foreground"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted",
              )}
            >
              {op.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Impresoras ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Impresoras del local</h3>
            <p className="text-xs text-muted-foreground">
              La IP y el puerto son los de la impresora dentro de la red del local. El
              servidor nunca le habla directo: lo hace el programa que corre en tu PC.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditando(IMPRESORA_NUEVA)}>
            Agregar impresora
          </Button>
        </div>

        {impresoras.length === 0 && !editando && (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Todavía no hay ninguna. Sin impresoras, nada se encola: el sistema sigue
            funcionando igual que hasta ahora.
          </p>
        )}

        <ul className="space-y-2">
          {impresoras.map((imp) => (
            <li
              key={imp.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-xs"
            >
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{imp.name}</span>
                  <Badge variant="outline" className="text-rotulo">
                    {imp.rol === "RECIBO" ? "Recibos" : "Comandas"}
                  </Badge>
                  {!imp.active && (
                    <Badge variant="secondary" className="text-rotulo">
                      Apagada
                    </Badge>
                  )}
                </div>
                <span className="font-mono text-rotulo text-muted-foreground">
                  {imp.host}:{imp.port} · {imp.width === "MM55" ? "55 mm" : "80 mm"}
                  {imp.abreCajon ? " · abre cajón" : ""}
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pendiente}
                  onClick={() =>
                    correr(
                      () => imprimirPrueba(ESTADO_INICIAL, { printerId: imp.id }),
                      "Página de prueba en la cola.",
                    )
                  }
                >
                  Probar
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditando(imp)}>
                  Editar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pendiente}
                  onClick={() =>
                    correr(
                      () => borrarImpresora(ESTADO_INICIAL, { id: imp.id }),
                      "Impresora borrada.",
                    )
                  }
                >
                  Borrar
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {editando && (
          <form
            action={async (formData: FormData) => {
              const res = await guardarImpresora(ESTADO_INICIAL, formData);
              if (res.ok) {
                toast.success("Impresora guardada.");
                setEditando(null);
              } else {
                toast.error(res.error);
              }
            }}
            className="space-y-3 rounded-xl border border-brand/30 bg-brand/5 p-3"
          >
            <input type="hidden" name="id" value={editando.id} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="imp-name" className="text-rotulo">Nombre</Label>
                <Input id="imp-name" name="name" defaultValue={editando.name} required className="text-xs" placeholder="Caja" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="imp-rol" className="text-rotulo">Para qué sirve</Label>
                <select
                  id="imp-rol"
                  name="rol"
                  defaultValue={editando.rol}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="RECIBO">Recibos del cliente</option>
                  <option value="COMANDA">Comandas de cocina</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="imp-host" className="text-rotulo">IP en la red del local</Label>
                <Input id="imp-host" name="host" defaultValue={editando.host} required className="text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="imp-port" className="text-rotulo">Puerto</Label>
                <Input id="imp-port" name="port" type="number" defaultValue={editando.port} className="text-xs font-mono" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="imp-width" className="text-rotulo">Ancho del rollo</Label>
                <select
                  id="imp-width"
                  name="width"
                  defaultValue={editando.width}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="MM80">80 mm (48 caracteres)</option>
                  <option value="MM55">55 mm (32 caracteres)</option>
                </select>
              </div>
              <div className="flex items-end gap-4 pb-1">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="abreCajon" defaultChecked={editando.abreCajon} className="accent-brand size-4" />
                  Abre el cajón
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="active" defaultChecked={editando.active} className="accent-brand size-4" />
                  Encendida
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" size="sm" className="bg-brand text-brand-foreground text-xs">
                Guardar impresora
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </section>

      {/* ── Rutas por estación ─────────────────────────────────────────────── */}
      {impresorasDeComanda.length > 0 && (
        <section className="space-y-2 rounded-xl border border-border p-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Qué imprime cada estación</h3>
            <p className="text-xs text-muted-foreground">
              Las estaciones salen de tus productos. Lo que no tenga impresora asignada
              cae en la primera de comandas: es preferible que el papel salga en el lugar
              equivocado a que no salga.
            </p>
          </div>

          <ul className="space-y-2 pt-1">
            {estaciones.map((estacion) => (
              <li key={estacion} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{estacion}</span>
                <select
                  value={mapa[estacion] ?? ""}
                  onChange={(e) => setMapa((m) => ({ ...m, [estacion]: e.target.value }))}
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="">Sin asignar</option>
                  {impresorasDeComanda.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            size="sm"
            disabled={pendiente}
            className="bg-brand text-brand-foreground text-xs"
            onClick={() =>
              correr(
                () =>
                  guardarRutasDeImpresion(ESTADO_INICIAL, {
                    rutas: JSON.stringify(
                      Object.entries(mapa)
                        .filter(([, printerId]) => printerId)
                        .map(([stationName, printerId]) => ({ stationName, printerId })),
                    ),
                  }),
                "Rutas guardadas.",
              )
            }
          >
            Guardar rutas
          </Button>
        </section>
      )}

      {/* ── El programa del local ──────────────────────────────────────────── */}
      <section className="space-y-3 rounded-xl border border-border p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Programa de impresión</h3>
          <p className="text-xs text-muted-foreground">
            Corre en una PC del local, en la misma red que las impresoras. Es el único
            que puede hablarles: desde internet no se llega a una impresora del bar.
            Registrá el equipo acá abajo y te damos el archivo listo para abrir.
          </p>
        </div>

        <ul className="space-y-2">
          {agentes.map((agente) => {
            const estado = estadoDelAgente(agente.ultimoContactoEn);
            return (
              <li
                key={agente.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{agente.nombre}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-rotulo font-bold", estado.clase)}>
                      {estado.texto}
                    </span>
                  </div>
                  {agente.ultimoContactoEn && (
                    <span className="text-rotulo text-muted-foreground numeral">
                      Último contacto: {formatDateTimeInTimeZone(agente.ultimoContactoEn, timeZone)}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pendiente}
                    onClick={() =>
                      iniciar(async () => {
                        const res = await regenerarTokenDeAgente(ESTADO_INICIAL, { id: agente.id });
                        if (res.ok) {
                          setCodigoNuevo(res.data.codigo);
                          toast.success("Código nuevo. El programa anterior dejó de servir.");
                        } else toast.error(res.error);
                      })
                    }
                  >
                    Volver a instalar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pendiente}
                    onClick={() =>
                      correr(
                        () => borrarAgenteDeImpresion(ESTADO_INICIAL, { id: agente.id }),
                        "Programa dado de baja.",
                      )
                    }
                  >
                    Quitar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="agente-nombre" className="text-rotulo">Nombre del equipo</Label>
            <Input
              id="agente-nombre"
              value={nombreAgente}
              onChange={(e) => setNombreAgente(e.target.value)}
              className="text-xs"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={pendiente}
            className="bg-brand text-brand-foreground text-xs"
            onClick={() =>
              iniciar(async () => {
                const res = await crearAgenteDeImpresion(ESTADO_INICIAL, { nombre: nombreAgente });
                if (res.ok) {
                  setCodigoNuevo(res.data.codigo);
                  toast.success("Equipo registrado. Ahora bajá el programa.");
                } else toast.error(res.error);
              })
            }
          >
            Registrar equipo
          </Button>
        </div>

        {codigoNuevo && (
          <div className="space-y-3 rounded-xl border border-brand/40 bg-brand/10 p-3">
            <div>
              <p className="text-xs font-bold text-brand">Equipo listo. Falta bajar el programa.</p>
              <p className="text-xs text-muted-foreground">
                El archivo ya viene con este equipo adentro: bajalo en la computadora del
                local y hacé doble clic. No hay que escribir nada.
              </p>
            </div>

            {/* El código viaja en el NOMBRE del archivo: el programa lo lee de sí
                mismo. Nadie copia un token de 43 caracteres a un archivo de texto,
                que era lo que había antes y ningún cajero iba a hacer. */}
            {hayDescargas ? (
              <div className="flex flex-wrap gap-2">
                {descargas
                  .filter((d) => d.disponible)
                  .map((d) => (
                    <a
                      key={d.so}
                      href={`/api/impresion/descargar?so=${d.so}&codigo=${encodeURIComponent(codigoNuevo)}`}
                      className={cn(
                        "rounded-lg px-3 py-2 text-xs font-bold transition-all",
                        d.so === soDetectado
                          ? "bg-brand text-brand-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Bajar para {d.etiqueta}
                      {d.so === soDetectado ? " · este equipo" : ""}
                    </a>
                  ))}
              </div>
            ) : (
              /* Sin ejecutables publicados los botones desaparecían y no quedaba
                 NADA en su lugar: el equipo aparecía registrado, el código a la
                 vista, y ningún archivo que bajar ni una palabra sobre por qué.
                 Es un problema del servidor, así que se dice como tal, con lo que
                 hay que hacer y a quién le toca. */
              <p
                role="alert"
                className="rounded-lg border border-warning/50 bg-warning/10 p-2.5 text-xs text-warning-soft"
              >
                <span className="font-bold">El programa no está publicado en este servidor.</span>{" "}
                El equipo quedó registrado y el código sirve, pero falta subir los
                ejecutables: se compilan con <code className="font-mono">pnpm agente:build</code> y
                se dejan donde apunta <code className="font-mono">DESCARGAS_AGENTE_DIR</code>. No es
                algo que se resuelva desde esta pantalla.
              </p>
            )}

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Lo voy a bajar desde otra computadora
              </summary>
              <div className="space-y-2 pt-2">
                <p className="text-muted-foreground">
                  Si el archivo se baja en otra máquina o el navegador le cambia el nombre,
                  el programa va a pedir este código al abrirse. Vence en una hora.
                </p>
                <code className="block rounded-lg bg-[var(--panel-3)] p-2 text-center font-mono text-base font-bold tracking-widest text-foreground">
                  {codigoNuevo}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copiar(codigoNuevo, "Código")}
                >
                  Copiar código
                </Button>
              </div>
            </details>

            <Button type="button" size="sm" variant="outline" onClick={() => setCodigoNuevo(null)}>
              Listo
            </Button>
          </div>
        )}
      </section>

      {/* ── Estado de la cola ──────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-xl border border-border p-4 text-xs">
        <h3 className="text-sm font-semibold text-foreground">Cola de impresión</h3>
        <p className="text-muted-foreground">
          <span className="numeral font-bold text-foreground">{pendientes}</span> trabajo(s)
          esperando. Un trabajo se reintenta tres veces; si no sale, te avisamos.
        </p>

        {fallidos.length > 0 && (
          <ul className="space-y-1 pt-1">
            {fallidos.map((f) => (
              <li key={f.id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                <span className="font-semibold text-destructive-soft">
                  {f.tipo} · {f.printer.name}
                </span>
                <span className="block text-rotulo text-muted-foreground">
                  {formatDateTimeInTimeZone(f.updatedAt, timeZone)} · {f.ultimoError ?? "sin detalle"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
