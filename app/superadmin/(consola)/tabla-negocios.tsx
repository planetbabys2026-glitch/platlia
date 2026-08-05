"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { diasParaElCorte } from "@/lib/billing/suscripcion";
import { formatDayInTimeZone } from "@/lib/time";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { extenderLicencia, suspenderEmpresa } from "@/features/superadmin/actions";
import { toast } from "sonner";
import { 
  Search, 
  Calendar, 
  Users, 
  LayoutGrid, 
  Boxes, 
  Receipt, 
  Clock, 
  Settings2,
  X
} from "lucide-react";

type NegocioItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  subscription: {
    status: string;
    priceCop: number;
    trialEndsAt: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    graceUntil: Date | null;
  } | null;
  _count: {
    memberships: number;
    tables: number;
    products: number;
    orders: number;
  };
};

const ESTADO_LICENCIA: Record<string, { texto: string; color: string }> = {
  PRUEBA: { texto: "En prueba", color: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  ACTIVA: { texto: "Al día", color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  VENCIDA: { texto: "Vencida", color: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  SUSPENDIDA: { texto: "Suspendida", color: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300" },
  CANCELADA: { texto: "Cancelada", color: "border-gray-500/40 bg-gray-500/10 text-gray-700 dark:text-gray-300" },
};

export function TablaNegocios({ negocios }: { negocios: NegocioItem[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("TODOS");
  const [orden, setOrden] = useState<"corte" | "recientes" | "nombre" | "pedidos">("corte");

  // Conteo rápido por categoría
  const conteos = useMemo(() => {
    let enPrueba = 0;
    let alDia = 0;
    let vencidos = 0;
    let suspendidos = 0;

    for (const n of negocios) {
      if (n.status !== "ACTIVO" || n.subscription?.status === "SUSPENDIDA") {
        suspendidos++;
      } else if (n.subscription?.status === "PRUEBA") {
        enPrueba++;
      } else if (n.subscription?.status === "ACTIVA") {
        alDia++;
      } else if (n.subscription?.status === "VENCIDA") {
        vencidos++;
      }
    }

    return { todos: negocios.length, enPrueba, alDia, vencidos, suspendidos };
  }, [negocios]);

  // Filtrado y Ordenamiento
  const negociosFiltrados = useMemo(() => {
    return negocios
      .filter((n) => {
        // Búsqueda libre
        const q = busqueda.trim().toLowerCase();
        const coincideBusqueda =
          !q ||
          n.name.toLowerCase().includes(q) ||
          n.slug.toLowerCase().includes(q) ||
          n.id.toLowerCase().includes(q);

        if (!coincideBusqueda) return false;

        // Filtro por estado
        if (filtroEstado === "TODOS") return true;
        if (filtroEstado === "PRUEBA") return n.subscription?.status === "PRUEBA";
        if (filtroEstado === "ACTIVA") return n.subscription?.status === "ACTIVA";
        if (filtroEstado === "VENCIDA") return n.subscription?.status === "VENCIDA";
        if (filtroEstado === "SUSPENDIDO")
          return n.status !== "ACTIVO" || n.subscription?.status === "SUSPENDIDA";

        return true;
      })
      .sort((a, b) => {
        if (orden === "recientes") {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (orden === "nombre") {
          return a.name.localeCompare(b.name);
        }
        if (orden === "pedidos") {
          return b._count.orders - a._count.orders;
        }
        // "corte" - Días restantes ascendente (menor a mayor)
        const diasA = a.subscription ? diasParaElCorte(a.subscription) ?? 9999 : 9999;
        const diasB = b.subscription ? diasParaElCorte(b.subscription) ?? 9999 : 9999;
        return diasA - diasB;
      });
  }, [negocios, busqueda, filtroEstado, orden]);

  return (
    <div className="space-y-4">
      {/* Controles de Búsqueda, Filtro e Indicadores */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
        
        {/* Barra Superior: Búsqueda y Ordenamiento */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre de negocio, slug o ID..."
              className="pl-9 pr-8 text-sm h-10"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground shrink-0 hidden sm:inline">
              Ordenar:
            </span>
            <select
              value={orden}
              onChange={(e) => setOrden(e.target.value as "corte" | "recientes" | "nombre" | "pedidos")}
              className="h-10 rounded-md border border-input bg-background px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="corte">Vencimiento más próximo</option>
              <option value="recientes">Más recientes primero</option>
              <option value="nombre">Nombre (A-Z)</option>
              <option value="pedidos">Mayor actividad (pedidos)</option>
            </select>
          </div>
        </div>

        {/* Pestañas de Filtros de Estado */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
          <FilterPill
            label={`Todos (${conteos.todos})`}
            activo={filtroEstado === "TODOS"}
            onClick={() => setFiltroEstado("TODOS")}
          />
          <FilterPill
            label={`En prueba (${conteos.enPrueba})`}
            activo={filtroEstado === "PRUEBA"}
            onClick={() => setFiltroEstado("PRUEBA")}
            colorActive="bg-amber-600 text-white"
          />
          <FilterPill
            label={`Al día (${conteos.alDia})`}
            activo={filtroEstado === "ACTIVA"}
            onClick={() => setFiltroEstado("ACTIVA")}
            colorActive="bg-emerald-600 text-white"
          />
          <FilterPill
            label={`Vencidos (${conteos.vencidos})`}
            activo={filtroEstado === "VENCIDA"}
            onClick={() => setFiltroEstado("VENCIDA")}
            colorActive="bg-rose-600 text-white"
          />
          <FilterPill
            label={`Suspendidos (${conteos.suspendidos})`}
            activo={filtroEstado === "SUSPENDIDO"}
            onClick={() => setFiltroEstado("SUSPENDIDO")}
            colorActive="bg-red-600 text-white"
          />
        </div>

      </div>

      {/* Resultados de Negocios */}
      {negociosFiltrados.length === 0 ? (
        <Card className="py-12 text-center border-dashed">
          <CardContent className="space-y-2">
            <p className="text-muted-foreground text-sm font-medium">
              No se encontraron negocios con los filtros aplicados.
            </p>
            {busqueda && (
              <Button onClick={() => setBusqueda("")} variant="outline" size="sm">
                Limpiar búsqueda
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground font-medium px-1">
            Mostrando <strong>{negociosFiltrados.length}</strong> de {negocios.length} negocios
          </p>

          <div className="grid grid-cols-1 gap-3">
            {negociosFiltrados.map((negocio) => (
              <TarjetaNegocio key={negocio.id} negocio={negocio} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterPill({
  label,
  activo,
  onClick,
  colorActive = "bg-brand text-brand-foreground",
}: {
  label: string;
  activo: boolean;
  onClick: () => void;
  colorActive?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
        activo
          ? `${colorActive} shadow-xs`
          : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function TarjetaNegocio({ negocio }: { negocio: NegocioItem }) {
  const sub = negocio.subscription;
  const dias = sub ? diasParaElCorte(sub) : null;
  const infoEstado = sub ? ESTADO_LICENCIA[sub.status] : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-all hover:border-brand/40 space-y-3">
      
      {/* Encabezado: Nombre, Slug, Badges de Estado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-foreground">{negocio.name}</h3>
            <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
              {negocio.slug}
            </span>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            <span>Registrado el {formatDayInTimeZone(negocio.createdAt, "America/Bogota")}</span>
          </p>
        </div>

        {/* Badges de Licencia y Estado */}
        <div className="flex items-center gap-2 shrink-0">
          {negocio.status !== "ACTIVO" && (
            <Badge variant="destructive" className="text-[11px] font-semibold">
              Suspendido
            </Badge>
          )}

          {sub ? (
            <Badge variant="outline" className={`text-[11px] font-semibold border ${infoEstado?.color}`}>
              {infoEstado?.texto ?? sub.status}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[11px]">
              Sin suscripción
            </Badge>
          )}

          {/* Días restantes badge */}
          {dias !== null && (
            <Badge
              variant="outline"
              className={`text-[11px] font-mono font-bold ${
                dias <= 0
                  ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400"
                  : dias <= 3
                  ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "border-brand/40 bg-brand/10 text-brand dark:text-[#3E9EA2]"
              }`}
            >
              <Clock className="size-3 mr-1" />
              {dias > 0
                ? `${dias} ${dias === 1 ? "día" : "días"} ${sub?.status === "PRUEBA" ? "de prueba" : "de servicio"}`
                : "Servicio cortado"}
            </Badge>
          )}
        </div>
      </div>

      {/* Métricas y Acciones Unificadas */}
      <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground">
        
        {/* Estadísticas de Uso */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1 font-medium text-foreground">
            <Users className="size-3.5 text-brand dark:text-[#3E9EA2]" />
            <span>{negocio._count.memberships} equipo</span>
          </span>
          <span className="flex items-center gap-1 font-medium text-foreground">
            <LayoutGrid className="size-3.5 text-brand dark:text-[#3E9EA2]" />
            <span>{negocio._count.tables} mesas</span>
          </span>
          <span className="flex items-center gap-1 font-medium text-foreground">
            <Boxes className="size-3.5 text-brand dark:text-[#3E9EA2]" />
            <span>{negocio._count.products} productos</span>
          </span>
          <span className="flex items-center gap-1 font-medium text-foreground">
            <Receipt className="size-3.5 text-brand dark:text-[#3E9EA2]" />
            <span>{negocio._count.orders} pedidos</span>
          </span>
        </div>

        {/* Modal de Acciones de Licencia */}
        <GestionarLicenciaModal negocio={negocio} />

      </div>

    </div>
  );
}

function GestionarLicenciaModal({ negocio }: { negocio: NegocioItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [diasExtender, setDiasExtender] = useState<number>(30);
  const [motivoExtender, setMotivoExtender] = useState("");
  const [motivoSuspender, setMotivoSuspender] = useState("");
  const [isPending, startTransition] = useTransition();

  const suspendido = negocio.status !== "ACTIVO";

  const handleExtender = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivoExtender || motivoExtender.trim().length < 3) {
      toast.error("Ingresa un motivo válido para la extensión (mínimo 3 caracteres)");
      return;
    }

    startTransition(async () => {
      const res = await extenderLicencia(ESTADO_INICIAL, {
        businessId: negocio.id,
        dias: Number(diasExtender),
        motivo: motivoExtender.trim(),
      });

      if (res.ok) {
        toast.success(`Licencia de ${negocio.name} extendida por ${diasExtender} días.`);
        setOpen(false);
        setMotivoExtender("");
        router.refresh();
      } else {
        toast.error(res.error || "Ocurrió un error al extender la licencia.");
      }
    });
  };

  const handleSuspender = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivoSuspender || motivoSuspender.trim().length < 3) {
      toast.error("Ingresa un motivo válido (mínimo 3 caracteres)");
      return;
    }

    startTransition(async () => {
      const res = await suspenderEmpresa(ESTADO_INICIAL, {
        businessId: negocio.id,
        suspender: !suspendido,
        motivo: motivoSuspender.trim(),
      });

      if (res.ok) {
        toast.success(
          `Negocio ${negocio.name} ${suspendido ? "reactivado" : "suspendido"} con éxito.`,
        );
        setOpen(false);
        setMotivoSuspender("");
        router.refresh();
      } else {
        toast.error(res.error || "Ocurrió un error.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs font-semibold shrink-0">
          <Settings2 className="size-3.5" />
          <span>Gestionar Licencia</span>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground">
            Gestionar Licencia · {negocio.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Ajusta los días de servicio o modifica el estado de operación de este negocio.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="extender" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="extender" className="text-xs">Extender Licencia</TabsTrigger>
            <TabsTrigger value="estado" className="text-xs">Estado de Operación</TabsTrigger>
          </TabsList>

          {/* Pestaña: Extender Licencia */}
          <TabsContent value="extender" className="space-y-4 pt-3">
            <form onSubmit={handleExtender} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground block">
                  1. Selecciona preajuste de días a agregar:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[7, 15, 30, 60, 90, 365].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDiasExtender(d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        diasExtender === d
                          ? "bg-brand text-brand-foreground border-brand shadow-xs"
                          : "bg-muted/60 border-border hover:bg-muted text-foreground"
                      }`}
                    >
                      +{d} días {d === 365 ? "(1 año)" : ""}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="diasInput" className="text-xs font-semibold text-foreground">
                  Días a extender:
                </label>
                <Input
                  id="diasInput"
                  type="number"
                  min={1}
                  max={365}
                  value={diasExtender}
                  onChange={(e) => setDiasExtender(Number(e.target.value))}
                  className="text-sm font-semibold h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="motivoExt" className="text-xs font-semibold text-foreground">
                  Motivo de la extensión (obligatorio para auditoría) *
                </label>
                <Input
                  id="motivoExt"
                  required
                  minLength={3}
                  placeholder="Ej. Cortesía comercial / Pago transferido por PSE"
                  value={motivoExtender}
                  onChange={(e) => setMotivoExtender(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <Button
                type="submit"
                disabled={isPending}
                className="w-full bg-brand text-brand-foreground hover:bg-brand/90 text-xs font-semibold h-10"
              >
                {isPending ? "Aplicando cambios..." : `Confirmar y sumar +${diasExtender} días`}
              </Button>
            </form>
          </TabsContent>

          {/* Pestaña: Estado del Negocio */}
          <TabsContent value="estado" className="space-y-4 pt-3">
            <form onSubmit={handleSuspender} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-muted/60 border border-border text-xs space-y-1">
                <p className="font-semibold text-foreground">
                  Estado actual: {suspendido ? "SUSPENDIDO" : "ACTIVO"}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  {suspendido
                    ? "Al reactivar, los usuarios de este negocio podrán ingresar nuevamente a su panel POS."
                    : "Al suspender, se bloqueará el acceso al POS y comanda para todos los miembros de este negocio."}
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="motivoSusp" className="text-xs font-semibold text-foreground">
                  Motivo de la acción (obligatorio para auditoría) *
                </label>
                <Input
                  id="motivoSusp"
                  required
                  minLength={3}
                  placeholder="Ej. Mora acumulada / Solicitud del propietario"
                  value={motivoSuspender}
                  onChange={(e) => setMotivoSuspender(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <Button
                type="submit"
                disabled={isPending}
                variant={suspendido ? "default" : "destructive"}
                className="w-full text-xs font-semibold h-10"
              >
                {isPending
                  ? "Procesando..."
                  : suspendido
                  ? "Reactivar Negocio"
                  : "Suspender Negocio"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
