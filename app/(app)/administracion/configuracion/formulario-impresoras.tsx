"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RotuloSeccion } from "@/components/marca/pantalla";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import {
  borrarAgenteDeImpresion,
  borrarImpresora,
  crearAgenteDeImpresion,
  emitirConfiguracionDeAgente,
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
  descargas: { so: "windows" | "linux" | "mac"; etiqueta: string; disponible: boolean }[];
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
  const [codigoNuevo, setCodigoNuevo] = useState<{ id: string; codigo: string } | null>(null);
  const [manual, setManual] = useState<{ nombre: string; archivo: string } | null>(null);
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

  /**
   * Pide el archivo de configuración de un equipo.
   *
   * Emitir el token quema el código de emparejamiento, así que se limpia de la
   * pantalla: dejarlo a la vista sería ofrecer una llave que ya no abre.
   */
  const pedirConfiguracion = (id: string) =>
    iniciar(async () => {
      const res = await emitirConfiguracionDeAgente(ESTADO_INICIAL, { id });
      if (res.ok) {
        setCodigoNuevo(null);
        setManual({ nombre: res.data.nombre, archivo: res.data.archivo });
      } else toast.error(res.error);
    });

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
                "rounded-xl px-3 py-2 text-xs font-semibold transition-all",
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
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Todavía no hay ninguna. Sin impresoras, nada se encola: el sistema sigue
            funcionando igual que hasta ahora.
          </p>
        )}

        <ul className="space-y-2">
          {impresoras.map((imp) => (
            <li
              key={imp.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-xs"
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
                  className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
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
                  className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs"
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
                  className="h-9 rounded-xl border border-input bg-background px-3 text-xs"
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
          </p>
        </div>

        {/* ── Paso 1 ──────────────────────────────────────────────────────────
            La descarga vive acá y no adentro del recuadro de "Registrar equipo".
            Ahí estaba antes, y al recargar la página desaparecía: el único camino
            de vuelta era "Volver a instalar", que regenera el código y mata el
            token del equipo que ya estaba imprimiendo. Bajar el programa y dar de
            alta un equipo son dos cosas distintas y ahora se piden por separado.
            El archivo es idéntico para todos los locales y no lleva ningún
            secreto, así que no necesita ir acompañado de nada. */}
        <div className="space-y-2">
          <RotuloSeccion>1 · Bajá el programa</RotuloSeccion>
          {hayDescargas ? (
            <>
              <div className="flex flex-wrap gap-2">
                {descargas
                  .filter((d) => d.disponible)
                  .map((d) => (
                    <a
                      key={d.so}
                      href={`/api/impresion/descargar?so=${d.so}`}
                      className={cn(
                        "rounded-xl px-3 py-2 text-xs font-bold transition-all",
                        d.so === soDetectado
                          ? "bg-brand text-brand-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {d.etiqueta}
                      {d.so === soDetectado ? " · este equipo" : ""}
                    </a>
                  ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Guardalo en una carpeta de la computadora que esté en la misma red que las
                impresoras. Todavía no lo abras: primero necesita el archivo del paso 3.
              </p>
            </>
          ) : (
            <p
              role="alert"
              className="rounded-xl border border-warning/50 bg-warning/10 p-2.5 text-xs text-warning-soft"
            >
              <span className="font-bold">El programa no está publicado en este servidor.</span>{" "}
              Se compila con <code className="font-mono">pnpm agente:build</code> y viaja con el
              despliegue; si acá no aparece, ese paso no se hizo.
            </p>
          )}
        </div>

        <RotuloSeccion>2 · Registrá el equipo</RotuloSeccion>

        <ul className="space-y-2">
          {agentes.map((agente) => {
            const estado = estadoDelAgente(agente.ultimoContactoEn);
            return (
              <li
                key={agente.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-xs"
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
                <div className="flex flex-wrap gap-2">
                  {/* El camino de la instalación asistida: no baja nada de acá,
                      se lleva el archivo. Vive en la fila y no solo en el alta
                      porque hace falta cada vez que se cambia la computadora del
                      local, no una única vez. */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pendiente}
                    onClick={() => pedirConfiguracion(agente.id)}
                  >
                    Configurar a mano
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pendiente}
                    onClick={() =>
                      iniciar(async () => {
                        const res = await regenerarTokenDeAgente(ESTADO_INICIAL, { id: agente.id });
                        if (res.ok) {
                          setCodigoNuevo({ id: res.data.id, codigo: res.data.codigo });
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
                  setCodigoNuevo({ id: res.data.id, codigo: res.data.codigo });
                  toast.success("Equipo registrado.");
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
              <p className="text-xs font-bold text-brand">Equipo registrado.</p>
              <p className="text-xs text-muted-foreground">
                Falta darle su configuración: es un archivo chico que va junto al programa
                que bajaste en el paso 1.
              </p>
            </div>

            <Button
              type="button"
              size="sm"
              disabled={pendiente}
              className="bg-brand text-brand-foreground text-xs"
              onClick={() => pedirConfiguracion(codigoNuevo.id)}
            >
              Ver el archivo de configuración
            </Button>

            {/* El atajo, no el camino principal: el código de emparejamiento viaja
                en el NOMBRE del archivo y el programa lo lee de sí mismo, así que
                bajándolo desde acá no hay nada que pegar. Queda plegado porque solo
                sirve si se baja EN la computadora del local, y quien instala varios
                locales desde su propia máquina no está en ese caso. */}
            {hayDescargas && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Estoy sentado en la computadora del local: bajarlo ya configurado
                </summary>
                <div className="space-y-2 pt-2">
                  <p className="text-muted-foreground">
                    Este archivo trae el equipo adentro —viaja en su propio nombre— así que
                    alcanza con hacerle doble clic. No hay nada que pegar.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {descargas
                      .filter((d) => d.disponible)
                      .map((d) => (
                        <a
                          key={d.so}
                          href={`/api/impresion/descargar?so=${d.so}&codigo=${encodeURIComponent(codigoNuevo.codigo)}`}
                          className={cn(
                            "rounded-xl px-3 py-2 text-xs font-bold transition-all",
                            d.so === soDetectado
                              ? "bg-brand text-brand-foreground"
                              : "bg-muted text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {d.etiqueta}
                          {d.so === soDetectado ? " · este equipo" : ""}
                        </a>
                      ))}
                  </div>
                  <p className="text-muted-foreground">
                    Si el navegador le cambia el nombre al archivo, el programa va a pedir
                    este código al abrirse. Vence en una hora.
                  </p>
                  <code className="block rounded-xl bg-[var(--panel-3)] p-2 text-center font-mono text-base font-bold tracking-widest text-foreground">
                    {codigoNuevo.codigo}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copiar(codigoNuevo.codigo, "Código")}
                  >
                    Copiar código
                  </Button>
                </div>
              </details>
            )}

            <Button type="button" size="sm" variant="outline" onClick={() => setCodigoNuevo(null)}>
              Listo
            </Button>
          </div>
        )}

        {/* ── El archivo de configuración ────────────────────────────────────
            El otro camino de instalación: el programa no se baja de acá, lo lleva
            quien instala. Lo único que tiene que viajar del servidor a la
            computadora del local es este archivo, y con él el programa se
            autoconfigura igual —se copia a su carpeta y se anota para arrancar con
            la máquina—: no queda ningún paso manual después de pegarlo. */}
        {manual && (
          <div className="space-y-3 rounded-xl border border-brand/40 bg-brand/10 p-3">
            <div className="space-y-1">
              <RotuloSeccion>3 · Pegá esto junto al programa</RotuloSeccion>
              <p className="text-xs font-bold text-brand">
                Configuración de &ldquo;{manual.nombre}&rdquo;
              </p>
              <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                <li>
                  Guardalo con el nombre exacto <code className="font-mono">agente.json</code>, en la
                  misma carpeta donde dejaste el programa.
                </li>
                <li>Hacé doble clic en el programa.</li>
              </ol>
              <p className="text-xs text-muted-foreground">
                Eso es todo: se copia solo a donde tiene que vivir, queda arrancando con la
                computadora todos los días —sin pedir permisos de administrador y sin ventana
                abierta— y abre una página que dice si está imprimiendo.
              </p>
            </div>

            <pre className="overflow-x-auto rounded-xl bg-[var(--panel-3)] p-3 font-mono text-xs text-foreground">
              {manual.archivo}
            </pre>

            <div className="flex flex-wrap gap-2">
              {/* Bajarlo en vez de copiarlo evita el error más caro de este paso:
                  un token pegado con un espacio de más o cortado a la mitad falla
                  recién en el local, con la impresora conectada y sin pistas. */}
              <a
                download="agente.json"
                href={`data:application/json;charset=utf-8,${encodeURIComponent(manual.archivo)}`}
                className="rounded-xl bg-brand px-3 py-2 text-xs font-bold text-brand-foreground"
              >
                Bajar agente.json
              </a>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copiar(manual.archivo, "Archivo")}
              >
                Copiar
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setManual(null)}>
                Listo
              </Button>
            </div>

            <p
              role="alert"
              className="rounded-xl border border-warning/50 bg-warning/10 p-2.5 text-xs text-warning-soft"
            >
              Adentro va la llave de la cola de impresión de este local: no lo mandes por chat ni lo
              dejes en Descargas. <span className="font-bold">Se muestra una sola vez</span> — de
              acá en más el servidor solo guarda su huella. Y si ya habías bajado el programa con el
              código adentro, ese código dejó de servir.
            </p>
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
              <li key={f.id} className="rounded-xl border border-destructive/30 bg-destructive/5 p-2">
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
