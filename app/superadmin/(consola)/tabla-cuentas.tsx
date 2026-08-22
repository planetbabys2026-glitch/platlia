"use client";

import Link from "next/link";
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
import { formatCop } from "@/lib/money";
import { cotizar, type ListaDePrecios } from "@/lib/billing/precios";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import {
  actualizarLimiteSucursales,
  extenderLicencia,
  suspenderEmpresa,
} from "@/features/superadmin/actions";
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
  Store,
  X,
} from "lucide-react";

type SedeItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  subscription: {
    status: string;
    maxBranches: number;
    trialEndsAt: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    graceUntil: Date | null;
  } | null;
  settings: {
    facturacionElectronicaHabilitada: boolean;
    paquetesDocumentosDisponibles: number;
    documentosEmitidosConsumidos: number;
  } | null;
  _count: { memberships: number; tables: number; products: number; orders: number };
};

type CuentaItem = {
  clave: string;
  duenoId: string | null;
  duenoNombre: string;
  duenoCorreo: string | null;
  principal: SedeItem;
  sedes: SedeItem[];
  totales: { memberships: number; tables: number; products: number; orders: number };
};

const ESTADO_LICENCIA: Record<string, { texto: string; color: string }> = {
  PRUEBA: { texto: "En prueba", color: "border-warning/40 bg-warning/10 text-warning-soft" },
  ACTIVA: { texto: "Al día", color: "border-success/40 bg-success/10 text-success-soft" },
  VENCIDA: { texto: "Vencida", color: "border-destructive/40 bg-destructive/10 text-destructive-soft" },
  SUSPENDIDA: { texto: "Suspendida", color: "border-destructive/40 bg-destructive/10 text-destructive-soft" },
  CANCELADA: { texto: "Cancelada", color: "border-[var(--panel-3)] bg-[var(--panel-3)] text-muted-foreground dark:text-foreground" },
};

/**
 * Lo que la cuenta paga por mes, cotizado contra la lista vigente.
 *
 * Sale de `ListaDePrecios` y de cuántas sedes tiene, y de ningún otro lado: no
 * existe un precio por empresa. Si la lista sube, sube para todos; si hay una
 * promoción vigente, la reciben todos por igual, viejos y nuevos.
 */
function precioDeLaCuenta(cuenta: CuentaItem, lista: ListaDePrecios): number | null {
  if (!cuenta.principal.subscription) return null;
  return cotizar({ lista, sedes: cuenta.sedes.length, periodicidad: "MENSUAL" }).mensualCop;
}

export function TablaCuentas({
  cuentas,
  lista,
}: {
  cuentas: CuentaItem[];
  lista: ListaDePrecios;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("TODOS");
  const [orden, setOrden] = useState<"corte" | "recientes" | "nombre" | "pedidos">("corte");

  // Conteo rápido por categoría. Se mira la licencia de la principal: es la
  // única que decide, porque las demás sedes viven con sus mismas fechas.
  const conteos = useMemo(() => {
    let enPrueba = 0;
    let alDia = 0;
    let vencidos = 0;
    let suspendidos = 0;

    for (const c of cuentas) {
      const sub = c.principal.subscription;
      if (c.principal.status !== "ACTIVO" || sub?.status === "SUSPENDIDA") {
        suspendidos++;
      } else if (sub?.status === "PRUEBA") {
        enPrueba++;
      } else if (sub?.status === "ACTIVA") {
        alDia++;
      } else if (sub?.status === "VENCIDA") {
        vencidos++;
      }
    }

    return { todos: cuentas.length, enPrueba, alDia, vencidos, suspendidos };
  }, [cuentas]);

  const cuentasFiltradas = useMemo(() => {
    return cuentas
      .filter((c) => {
        // Búsqueda libre: alcanza con que coincida el dueño o CUALQUIERA de sus
        // sedes. Soporte casi siempre tiene a mano el nombre de un local, no el
        // de la persona.
        const q = busqueda.trim().toLowerCase();
        const coincideBusqueda =
          !q ||
          c.duenoNombre.toLowerCase().includes(q) ||
          (c.duenoCorreo?.toLowerCase().includes(q) ?? false) ||
          c.sedes.some(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              s.slug.toLowerCase().includes(q) ||
              s.id.toLowerCase().includes(q),
          );

        if (!coincideBusqueda) return false;

        const sub = c.principal.subscription;
        if (filtroEstado === "TODOS") return true;
        if (filtroEstado === "PRUEBA") return sub?.status === "PRUEBA";
        if (filtroEstado === "ACTIVA") return sub?.status === "ACTIVA";
        if (filtroEstado === "VENCIDA") return sub?.status === "VENCIDA";
        if (filtroEstado === "SUSPENDIDO")
          return c.principal.status !== "ACTIVO" || sub?.status === "SUSPENDIDA";

        return true;
      })
      .sort((a, b) => {
        if (orden === "recientes") {
          return (
            new Date(b.principal.createdAt).getTime() -
            new Date(a.principal.createdAt).getTime()
          );
        }
        if (orden === "nombre") {
          return a.duenoNombre.localeCompare(b.duenoNombre);
        }
        if (orden === "pedidos") {
          return b.totales.orders - a.totales.orders;
        }
        // "corte" - Días restantes ascendente (menor a mayor)
        const diasA = a.principal.subscription
          ? diasParaElCorte(a.principal.subscription) ?? 9999
          : 9999;
        const diasB = b.principal.subscription
          ? diasParaElCorte(b.principal.subscription) ?? 9999
          : 9999;
        return diasA - diasB;
      });
  }, [cuentas, busqueda, filtroEstado, orden]);

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
              placeholder="Buscar por propietario, correo, sede, slug o ID..."
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
              onChange={(e) =>
                setOrden(e.target.value as "corte" | "recientes" | "nombre" | "pedidos")
              }
              className="h-10 rounded-md border border-input bg-background px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="corte">Vencimiento más próximo</option>
              <option value="recientes">Más recientes primero</option>
              <option value="nombre">Propietario (A-Z)</option>
              <option value="pedidos">Mayor actividad (pedidos)</option>
            </select>
          </div>
        </div>

        {/* Pestañas de Filtros de Estado */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
          <FilterPill
            label={`Todas (${conteos.todos})`}
            activo={filtroEstado === "TODOS"}
            onClick={() => setFiltroEstado("TODOS")}
          />
          <FilterPill
            label={`En prueba (${conteos.enPrueba})`}
            activo={filtroEstado === "PRUEBA"}
            onClick={() => setFiltroEstado("PRUEBA")}
            colorActive="bg-warning text-white"
          />
          <FilterPill
            label={`Al día (${conteos.alDia})`}
            activo={filtroEstado === "ACTIVA"}
            onClick={() => setFiltroEstado("ACTIVA")}
            colorActive="bg-success text-white"
          />
          <FilterPill
            label={`Vencidas (${conteos.vencidos})`}
            activo={filtroEstado === "VENCIDA"}
            onClick={() => setFiltroEstado("VENCIDA")}
            colorActive="bg-destructive text-white"
          />
          <FilterPill
            label={`Suspendidas (${conteos.suspendidos})`}
            activo={filtroEstado === "SUSPENDIDO"}
            onClick={() => setFiltroEstado("SUSPENDIDO")}
            colorActive="bg-destructive text-white"
          />
        </div>

      </div>

      {/* Resultados */}
      {cuentasFiltradas.length === 0 ? (
        <Card className="py-12 text-center border-dashed">
          <CardContent className="space-y-2">
            <p className="text-muted-foreground text-sm font-medium">
              No se encontraron cuentas con los filtros aplicados.
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
            Mostrando <strong>{cuentasFiltradas.length}</strong> de {cuentas.length} cuentas
          </p>

          <div className="grid grid-cols-1 gap-3">
            {cuentasFiltradas.map((cuenta) => (
              <TarjetaCuenta key={cuenta.clave} cuenta={cuenta} lista={lista} />
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

function TarjetaCuenta({ cuenta, lista }: { cuenta: CuentaItem; lista: ListaDePrecios }) {
  const sub = cuenta.principal.subscription;
  const dias = sub ? diasParaElCorte(sub) : null;
  const infoEstado = sub ? ESTADO_LICENCIA[sub.status] : null;
  const precio = precioDeLaCuenta(cuenta, lista);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-all hover:border-brand/40 space-y-3">

      {/* Encabezado: propietario y estado de la licencia */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-foreground">{cuenta.duenoNombre}</h3>
            {cuenta.sedes.length > 1 && (
              <Badge variant="outline" className="text-rotulo font-semibold border-brand/40 bg-brand/10 text-brand">
                <Store className="size-3 mr-1" />
                {cuenta.sedes.length} sedes
              </Badge>
            )}
          </div>
          {cuenta.duenoCorreo && (
            <p className="text-xs text-muted-foreground">{cuenta.duenoCorreo}</p>
          )}
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            <span>
              Cliente desde el{" "}
              {formatDayInTimeZone(cuenta.principal.createdAt, "America/Bogota")}
            </span>
          </p>
        </div>

        {/* Badges de Licencia y Estado */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {cuenta.principal.status !== "ACTIVO" && (
            <Badge variant="destructive" className="text-rotulo font-semibold">
              Suspendida
            </Badge>
          )}

          {sub ? (
            <Badge variant="outline" className={`text-rotulo font-semibold border ${infoEstado?.color}`}>
              {infoEstado?.texto ?? sub.status}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-rotulo">
              Sin suscripción
            </Badge>
          )}

          {precio !== null && (
            <Badge variant="outline" className="text-rotulo font-mono font-bold border-border">
              {formatCop(precio)} / mes
            </Badge>
          )}

          {/* Días restantes badge */}
          {dias !== null && (
            <Badge
              variant="outline"
              className={`text-rotulo font-mono font-bold ${
                dias <= 0
                  ? "border-destructive-soft bg-destructive/10 text-destructive-soft"
                  : dias <= 3
                  ? "border-warning-soft bg-warning/10 text-warning-soft"
                  : "border-brand/40 bg-brand/10 text-brand"
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

      {/* Las sedes de la cuenta */}
      <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-muted/30 text-xs">
        {cuenta.sedes.map((sede, i) => (
          <li key={sede.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground">{sede.name}</span>
              <span className="font-mono text-rotulo text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {sede.slug}
              </span>
              {i === 0 && (
                <Badge variant="outline" className="text-rotulo border-brand/40 text-brand">
                  Principal
                </Badge>
              )}
              {sede.status !== "ACTIVO" && (
                <Badge variant="destructive" className="text-rotulo">
                  Suspendida
                </Badge>
              )}
            </div>
            <span className="text-muted-foreground text-rotulo">
              <span className="numeral">{sede._count.orders}</span> pedidos
            </span>
          </li>
        ))}
      </ul>

      {/* Métricas y Acciones Unificadas */}
      <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground">

        {/* Estadísticas de Uso, sumadas entre las sedes */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1 font-medium text-foreground">
            <Users className="size-3.5 text-brand" />
            <span>
              <span className="numeral">{cuenta.totales.memberships}</span> equipo
            </span>
          </span>
          <span className="flex items-center gap-1 font-medium text-foreground">
            <LayoutGrid className="size-3.5 text-brand" />
            <span>
              <span className="numeral">{cuenta.totales.tables}</span> mesas
            </span>
          </span>
          <span className="flex items-center gap-1 font-medium text-foreground">
            <Boxes className="size-3.5 text-brand" />
            <span>
              <span className="numeral">{cuenta.totales.products}</span> productos
            </span>
          </span>
          <span className="flex items-center gap-1 font-medium text-foreground">
            <Receipt className="size-3.5 text-brand" />
            <span>
              <span className="numeral">{cuenta.totales.orders}</span> pedidos
            </span>
          </span>
        </div>

        {/* Modal de Acciones de Licencia */}
        <GestionarLicenciaModal cuenta={cuenta} />

      </div>

    </div>
  );
}

function GestionarLicenciaModal({ cuenta }: { cuenta: CuentaItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [diasExtender, setDiasExtender] = useState<number>(30);
  const [motivoExtender, setMotivoExtender] = useState("");
  const [motivoSuspender, setMotivoSuspender] = useState("");
  const [maxSucursales, setMaxSucursales] = useState<number>(
    cuenta.principal.subscription?.maxBranches ?? 1,
  );
  const [motivoSucursales, setMotivoSucursales] = useState("");
  const [isPending, startTransition] = useTransition();

  const suspendido = cuenta.principal.status !== "ACTIVO";
  // Toda acción de licencia va contra la sede principal: es la que cobra y la
  // que las acciones sincronizan hacia el resto de la cuenta.
  const businessId = cuenta.principal.id;
  const varias = cuenta.sedes.length > 1;
  const sufijoSedes = varias ? ` (${cuenta.sedes.length} sedes)` : "";

  const documentosAsignados = cuenta.sedes.reduce(
    (t, s) => t + (s.settings?.paquetesDocumentosDisponibles ?? 0),
    0,
  );
  const documentosEmitidos = cuenta.sedes.reduce(
    (t, s) => t + (s.settings?.documentosEmitidosConsumidos ?? 0),
    0,
  );

  const handleExtender = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivoExtender || motivoExtender.trim().length < 3) {
      toast.error("Ingresa un motivo válido para la extensión (mínimo 3 caracteres)");
      return;
    }

    startTransition(async () => {
      const res = await extenderLicencia(ESTADO_INICIAL, {
        businessId,
        dias: Number(diasExtender),
        motivo: motivoExtender.trim(),
      });

      if (res.ok) {
        toast.success(
          `Licencia de ${cuenta.duenoNombre} extendida por ${diasExtender} días${sufijoSedes}.`,
        );
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
        businessId,
        suspender: !suspendido,
        motivo: motivoSuspender.trim(),
      });

      if (res.ok) {
        toast.success(
          `Cuenta de ${cuenta.duenoNombre} ${suspendido ? "reactivada" : "suspendida"}${sufijoSedes}.`,
        );
        setOpen(false);
        setMotivoSuspender("");
        router.refresh();
      } else {
        toast.error(res.error || "Ocurrió un error.");
      }
    });
  };

  const handleActualizarSucursales = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivoSucursales || motivoSucursales.trim().length < 3) {
      toast.error("Ingresa un motivo válido para la modificación de sucursales (mínimo 3 caracteres)");
      return;
    }

    startTransition(async () => {
      const res = await actualizarLimiteSucursales(ESTADO_INICIAL, {
        businessId,
        maxBranches: Number(maxSucursales),
        motivo: motivoSucursales.trim(),
      });

      if (res.ok) {
        toast.success(
          `Límite de sucursales actualizado a ${maxSucursales} para ${cuenta.duenoNombre}.`,
        );
        setOpen(false);
        setMotivoSucursales("");
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
            Gestionar Licencia · {cuenta.duenoNombre}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {varias
              ? `La licencia es de la cuenta: lo que cambies acá alcanza a las ${cuenta.sedes.length} sedes.`
              : "Ajusta días de servicio, estado operacional, límite de sucursales o paquetes DIAN."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="extender" className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="extender" className="text-xs">Extender</TabsTrigger>
            <TabsTrigger value="estado" className="text-xs">Estado</TabsTrigger>
            <TabsTrigger value="sucursales" className="text-xs">
              Sucursales ({cuenta.principal.subscription?.maxBranches ?? 1})
            </TabsTrigger>
            <TabsTrigger value="factus" className="text-xs">DIAN 🧾</TabsTrigger>
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

          {/* Pestaña: Estado de la cuenta */}
          <TabsContent value="estado" className="space-y-4 pt-3">
            <form onSubmit={handleSuspender} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-muted/60 border border-border text-xs space-y-1">
                <p className="font-semibold text-foreground">
                  Estado actual: {suspendido ? "SUSPENDIDA" : "ACTIVA"}
                </p>
                <p className="text-muted-foreground text-rotulo">
                  {suspendido
                    ? "Al reactivar, los usuarios de esta cuenta podrán ingresar nuevamente a su panel POS."
                    : "Al suspender, se bloqueará el acceso al POS y comanda para todos los miembros de esta cuenta."}
                </p>
                {varias && (
                  <p className="text-warning-soft text-rotulo">
                    Alcanza a las {cuenta.sedes.length} sedes: {cuenta.sedes.map((s) => s.name).join(", ")}.
                  </p>
                )}
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
                  ? "Reactivar Cuenta"
                  : "Suspender Cuenta"}
              </Button>
            </form>
          </TabsContent>

          {/* Pestaña: Límite de Sucursales */}
          <TabsContent value="sucursales" className="space-y-4 pt-3">
            <form onSubmit={handleActualizarSucursales} className="space-y-4">
              <div className="p-3 rounded-xl bg-brand/10 border border-brand/20 text-xs space-y-1">
                <span className="font-bold text-brand block">
                  Control de Sucursales (Plan Cadena Empresarial)
                </span>
                <p className="text-muted-foreground text-rotulo leading-relaxed">
                  Define cuántas sucursales puede administrar este propietario (1 por defecto, 2 self-service con prorrateo, 3+ mediante negociación en superadmin).
                </p>
                <p className="text-muted-foreground text-rotulo">
                  Usando <strong className="numeral">{cuenta.sedes.length}</strong> de{" "}
                  <strong className="numeral">
                    {cuenta.principal.subscription?.maxBranches ?? 1}
                  </strong>{" "}
                  habilitadas.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="maxSucursalesInput" className="text-xs font-semibold text-foreground">
                  Número máximo de sucursales permitidas:
                </label>
                <Input
                  id="maxSucursalesInput"
                  type="number"
                  min={1}
                  max={999}
                  value={maxSucursales}
                  onChange={(e) => setMaxSucursales(Number(e.target.value))}
                  className="text-sm font-semibold h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="motivoSuc" className="text-xs font-semibold text-foreground">
                  Motivo comercial / auditoría (obligatorio) *
                </label>
                <Input
                  id="motivoSuc"
                  required
                  minLength={3}
                  placeholder="Ej. Plan Cadena Habilitado 5 Sedes"
                  value={motivoSucursales}
                  onChange={(e) => setMotivoSucursales(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <Button
                type="submit"
                disabled={isPending}
                className="w-full bg-brand text-brand-foreground hover:bg-brand/90 text-xs font-semibold h-10"
              >
                {isPending ? "Actualizando..." : `Guardar Límite (${maxSucursales} sucursales)`}
              </Button>
            </form>
          </TabsContent>

          {/* Pestaña: Facturación Electrónica DIAN */}
          <TabsContent value="factus" className="space-y-4 pt-3">
            <div className="space-y-1.5 rounded-xl border border-brand/20 bg-brand/10 p-3 text-xs">
              <span className="block font-bold text-brand">Facturación Electrónica DIAN</span>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-rotulo">
                <span>
                  Asignados: <strong className="numeral">{documentosAsignados}</strong> doc.
                </span>
                <span>
                  Emitidos: <strong className="numeral">{documentosEmitidos}</strong> doc.
                </span>
              </div>
              {varias && (
                <p className="text-muted-foreground text-rotulo">
                  Sumado entre las {cuenta.sedes.length} sedes. El rango de numeración lo autoriza
                  la DIAN por NIT, así que se asigna sede por sede.
                </p>
              )}
            </div>

            {/* Se administra en su propia sección y no acá: repartir la bolsa sin
                ver cuántos documentos quedan sin asignar es como se agotaba en
                medio del servicio de un cliente. */}
            <p className="text-xs text-muted-foreground">
              El módulo, el paquete de documentos y el rango de numeración de la DIAN se manejan
              desde la sección de Facturación, donde además se ve cuánto queda de la bolsa que le
              compramos a Factus.
            </p>

            <Button asChild className="h-10 w-full bg-brand text-xs font-semibold text-brand-foreground hover:bg-brand/90">
              <Link href="/superadmin/facturacion">Ir a Facturación electrónica</Link>
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
