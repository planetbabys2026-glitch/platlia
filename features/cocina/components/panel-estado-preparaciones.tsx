"use client";

import { useEffect, useState, useTransition } from "react";
import { ChefHat, Clock, RefreshCw, Search, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { obtenerEstadoPreparaciones } from "@/features/cocina/actions";
import type { ItemPreparacion } from "@/features/cocina/queries";
import { cn } from "@/lib/utils";
import { Loader } from "@/components/marca/loader";

function formatTiempoTranscurrido(fecha: Date | string | null): string {
  if (!fecha) return "Hace un momento";
  const ms = Date.now() - new Date(fecha).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "Recién enviado";
  if (min === 1) return "Hace 1 min";
  return `Hace ${min} min`;
}

function InsigniaEstado({ status }: { status: string }) {
  if (status === "LISTO") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-500 border border-emerald-500/30 animate-pulse">
        ¡LISTO!
      </span>
    );
  }
  if (status === "EN_PREPARACION") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2.5 py-0.5 font-mono text-xs font-bold text-cyan-400 border border-cyan-500/30">
        EN PREPARACIÓN
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 font-mono text-xs font-bold text-amber-400 border border-amber-500/30">
      PENDIENTE
    </span>
  );
}

export function BotonEstadoPreparaciones({
  variant = "outline",
  size = "sm",
  className,
}: {
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default" | "icon" | "icon-sm";
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [items, setItems] = useState<ItemPreparacion[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [isPending, startTransition] = useTransition();

  const cargarPreparaciones = () => {
    startTransition(async () => {
      try {
        const res = await obtenerEstadoPreparaciones(undefined, {});
        if (res.ok && Array.isArray(res.data)) {
          setItems(res.data);
        }
      } catch (err) {
        console.error("Error al obtener estado de preparaciones:", err);
      }
    });
  };

  useEffect(() => {
    if (abierto) {
      cargarPreparaciones();
      const intervalo = setInterval(cargarPreparaciones, 10000);
      return () => clearInterval(intervalo);
    }
  }, [abierto]);

  const pendientesCount = items.filter((i) => i.status !== "LISTO").length;
  const listosCount = items.filter((i) => i.status === "LISTO").length;

  const q = busqueda.trim().toLowerCase();
  const itemsFiltrados = items.filter((item) => {
    if (!q) return true;
    const destino = item.mesa ? `mesa ${item.mesa}` : `pedido #${item.code}`;
    const cuenta = item.cuenta || "";
    const plato = item.nameSnapshot.toLowerCase();
    return (
      destino.toLowerCase().includes(q) ||
      cuenta.toLowerCase().includes(q) ||
      plato.includes(q)
    );
  });

  // Agrupar ítems por mesa u orden
  const gruposMap = new Map<string, { titulo: string; cuenta: string | null; items: ItemPreparacion[] }>();
  for (const item of itemsFiltrados) {
    const clave = item.mesa ? `Mesa ${item.mesa}` : `Pedido #${item.code}`;
    const actual = gruposMap.get(clave) || { titulo: clave, cuenta: item.cuenta, items: [] };
    actual.items.push(item);
    gruposMap.set(clave, actual);
  }
  const grupos = Array.from(gruposMap.values());

  const esIcono = size === "icon" || size === "icon-sm";

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn(
            "relative transition-colors text-muted-foreground hover:text-brand",
            variant === "outline" && "border-brand/30 hover:border-brand",
            esIcono ? "size-9" : "gap-2 px-3",
            className,
          )}
          title="Ver estado de preparaciones en cocina"
        >
          <ChefHat className="size-4 shrink-0 transition-colors" />
          {!esIcono && (
            <span className="font-semibold text-xs truncate">Preparaciones</span>
          )}
          {items.length > 0 && (
            <span
              className={cn(
                "flex items-center justify-center rounded-full bg-brand font-mono font-black text-brand-foreground shadow-sm",
                esIcono
                  ? "absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] leading-none"
                  : "size-5 text-[10px] shrink-0",
              )}
            >
              {items.length > 99 ? "99+" : items.length}
            </span>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border-[var(--linea-30)] bg-[var(--tinta)]">
        <DialogHeader className="p-4 border-b border-[var(--linea-16)] flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <Utensils className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                Estado de Preparaciones en Cocina
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Consulta en vivo para responder a los comensales
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pr-6">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={cargarPreparaciones}
              disabled={isPending}
              title="Actualizar lista"
            >
              <RefreshCw className={cn("size-4 text-muted-foreground", isPending && "animate-spin")} />
            </Button>
          </div>
        </DialogHeader>

        <div className="p-4 bg-[var(--panel-bg)] border-b border-[var(--linea-16)] space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por mesa, pedido o plato…"
                className="pl-9 h-9 text-xs rounded-lg bg-[var(--panel)]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground font-mono font-medium">
              TOTAL EN COCINA: <strong className="text-foreground">{items.length}</strong>
            </span>
            <span className="text-amber-400 font-mono font-medium">
              PENDIENTES: <strong>{pendientesCount}</strong>
            </span>
            <span className="text-emerald-400 font-mono font-medium">
              LISTOS: <strong>{listosCount}</strong>
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {isPending && items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
              {/* 44px es donde la comanda todavía se lee entera —borde dentado, P
                  y línea de acento—. Más chica se vuelve un rectángulo beige y
                  deja de ser el isotipo. */}
              <Loader lado={44} etiqueta="Consultando cocina" />
              <p>Consultando cocina…</p>
            </div>
          ) : grupos.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <ChefHat className="size-8 text-muted-foreground/40" />
              <p className="font-semibold">No hay platos pendientes en cocina</p>
              <p className="text-xs">Todos los pedidos han sido entregados o están vacíos.</p>
            </div>
          ) : (
            grupos.map((grupo) => (
              <div
                key={grupo.titulo}
                className="rounded-xl border border-[var(--linea-16)] bg-[var(--panel)] p-3 space-y-2.5 shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-dashed border-[var(--linea-16)] pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-black text-sm text-foreground uppercase">
                      {grupo.titulo}
                    </span>
                    {grupo.cuenta && (
                      <span className="text-xs text-muted-foreground font-medium">
                        ({grupo.cuenta})
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono font-medium text-muted-foreground">
                    {grupo.items.length} {grupo.items.length === 1 ? "plato" : "platos"}
                  </span>
                </div>

                <div className="space-y-2">
                  {grupo.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 p-2 rounded-lg bg-[var(--panel-2)] border border-[var(--linea-10)] text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-brand shrink-0">
                            {item.quantity}x
                          </span>
                          <span className="font-semibold text-foreground truncate">
                            {item.nameSnapshot}
                          </span>
                        </div>

                        {item.modificadores.length > 0 && (
                          <p className="text-[11px] text-muted-foreground pl-5 italic">
                            + {item.modificadores.join(", ")}
                          </p>
                        )}

                        {item.notes && (
                          <p className="text-[11px] text-amber-300/90 font-medium pl-5">
                            Nota: {item.notes}
                          </p>
                        )}

                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground pl-5 pt-0.5">
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="size-3 text-muted-foreground" />
                            {formatTiempoTranscurrido(item.sentToKitchenAt || item.createdAt)}
                          </span>
                          <span>·</span>
                          <span>Estación: {item.estacion}</span>
                        </div>
                      </div>

                      <div className="shrink-0 pt-0.5">
                        <InsigniaEstado status={item.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
