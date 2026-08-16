"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, FileText, Printer, Receipt, Search } from "lucide-react";
import { emitirFacturaElectronica, emitirNotaCredito } from "@/features/dian/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Vacio } from "@/components/marca/pantalla";
import { formatCop } from "@/lib/money";
import { formatBusinessDate, formatTimeInTimeZone } from "@/lib/time";
import { formatTurno } from "@/lib/turns";
import { cn } from "@/lib/utils";

const METODOS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "T. débito",
  TARJETA_CREDITO: "T. crédito",
  NEQUI: "Nequi",
  DAVIPLATA: "Daviplata",
  TRANSFERENCIA: "Transferencia",
  BONO: "Bono",
  OTRO: "Otro",
};

const TIPOS: Record<string, string> = {
  MESA: "Mesa",
  LLEVAR: "Para llevar",
  DOMICILIO: "Domicilio",
};

const POR_PAGINA = 20;
const DIA_MS = 86_400_000;

export type CuentaCobrada = {
  id: string;
  code: number;
  type: string;
  channel: string;
  turnNumber: number | null;
  totalCop: number;
  tipCop: number;
  closedAt: Date | null;
  customerName: string | null;
  customerPhone: string | null;
  docType: string | null;
  docNumber: string | null;
  table: { name: string } | null;
  closedBy: { name: string } | null;
  payments: { method: string; amountCop: number }[];
  _count: { items: number };
  facturaElectronicaNumero: string | null;
  facturaElectronicaCufe: string | null;
  facturaElectronicaUrlPdf: string | null;
  facturaElectronicaEstado: string | null;
  facturaElectronicaError: string | null;
  notaCreditoNumero: string | null;
  notaCreditoCufe: string | null;
  notaCreditoUrlPdf: string | null;
};

/**
 * Sin acentos y en minúscula, para que "andres" encuentre a "Andrés".
 *
 * Buscar por el nombre del cliente es el caso real —el cajero se acuerda del
 * nombre, no del número de pedido— y en Colombia ese nombre viene con tilde la
 * mitad de las veces.
 */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Cómo se llama esta venta en una lista: Mesa 4, Turno 07, Pedido #12. */
function destinoDe(pedido: CuentaCobrada): string {
  if (pedido.table) return `Mesa ${pedido.table.name}`;
  if (pedido.turnNumber !== null) return `Turno ${formatTurno(pedido.turnNumber, 99, false)}`;
  return `Pedido #${pedido.code}`;
}

function metodosDe(pedido: CuentaCobrada): string {
  if (pedido.payments.length === 0) return "—";
  const nombres = [...new Set(pedido.payments.map((p) => METODOS[p.method] ?? p.method))];
  return nombres.join(" + ");
}

type EstadoDian = "EMITIDA" | "ERROR" | "PENDIENTE";

function estadoDianDe(pedido: CuentaCobrada): EstadoDian {
  if (pedido.facturaElectronicaCufe) return "EMITIDA";
  if (pedido.facturaElectronicaEstado === "ERROR") return "ERROR";
  return "PENDIENTE";
}

/**
 * Emitir la factura de una venta ya cobrada.
 *
 * Va acá y no en el cobro a propósito: emitir sale a la red y habla con la DIAN,
 * y no puede quedar entre el cliente y su vuelto. Acá se hace cuando se puede, y
 * si Factus falla se reintenta sin que nadie esté esperando en el mostrador.
 */
function BotonFacturar({ pedido }: { pedido: CuentaCobrada }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const estado = estadoDianDe(pedido);

  return (
    <Button
      type="button"
      size="sm"
      disabled={pendiente}
      onClick={() =>
        iniciar(async () => {
          const res = await emitirFacturaElectronica(ESTADO_INICIAL, { orderId: pedido.id });
          if (res.ok) {
            toast.success(
              res.data.numero
                ? `Factura ${res.data.numero} emitida.`
                : "Factura electrónica emitida.",
            );
            router.refresh();
          } else {
            toast.error(res.error || "No se pudo emitir la factura.");
          }
        })
      }
      className="h-11 gap-1.5 bg-brand text-xs font-bold text-brand-foreground hover:bg-brand/90 tableta:h-9"
    >
      <FileText className="size-3.5 shrink-0" />
      {pendiente ? "Emitiendo…" : estado === "ERROR" ? "Reintentar" : "Facturar"}
    </Button>
  );
}

/**
 * La nota crédito: la única forma de deshacer una factura ya emitida.
 *
 * Una factura electrónica no se borra. Sin esto, una venta facturada que después
 * se devuelve quedaría viva ante la DIAN: plata declarada que no se vendió. Pide
 * el motivo porque va escrito en el documento.
 */
function BotonNotaCredito({ pedido }: { pedido: CuentaCobrada }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendiente, iniciar] = useTransition();

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-11 border-destructive/40 text-xs font-bold text-destructive-soft tableta:h-9"
        >
          Nota crédito
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            Anular la factura {pedido.facturaElectronicaNumero ?? ""}
          </DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              const res = await emitirNotaCredito(ESTADO_INICIAL, {
                orderId: pedido.id,
                motivo: motivo.trim(),
              });
              if (res.ok) {
                toast.success(
                  res.data.numero
                    ? `Nota crédito ${res.data.numero} emitida.`
                    : "Nota crédito emitida.",
                );
                setAbierto(false);
                setMotivo("");
                router.refresh();
              } else {
                toast.error(res.error || "No se pudo emitir la nota crédito.");
              }
            });
          }}
        >
          <p className="text-xs text-muted-foreground">
            Se emite ante la DIAN un documento que anula esta factura. Consume un documento del
            paquete, igual que la factura.
          </p>

          <div className="space-y-1">
            <Label htmlFor={`motivo-${pedido.id}`} className="text-xs font-semibold">
              Motivo (queda escrito en la nota)
            </Label>
            <Input
              id={`motivo-${pedido.id}`}
              required
              minLength={5}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. El cliente devolvió el pedido"
              className="h-11 text-sm"
            />
          </div>

          <Button
            type="submit"
            disabled={pendiente}
            className="h-11 w-full bg-destructive text-xs font-bold text-white hover:bg-destructive/90"
          >
            {pendiente ? "Emitiendo…" : "Emitir nota crédito"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SelloDian({ pedido }: { pedido: CuentaCobrada }) {
  const estado = estadoDianDe(pedido);

  if (pedido.notaCreditoCufe) {
    return (
      <Badge
        variant="outline"
        title={`Anulada con la nota crédito ${pedido.notaCreditoNumero ?? ""}`}
        className="border-warning/40 font-mono text-rotulo font-bold text-warning-soft"
      >
        Anulada
      </Badge>
    );
  }

  if (estado === "EMITIDA") {
    const sello = (
      <Badge className="bg-success/15 font-mono text-rotulo font-bold text-success-soft">
        {pedido.facturaElectronicaNumero ?? "Emitida"}
      </Badge>
    );
    return pedido.facturaElectronicaUrlPdf ? (
      <a
        href={pedido.facturaElectronicaUrlPdf}
        target="_blank"
        rel="noopener"
        title="Ver la factura electrónica"
        className="inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {sello}
      </a>
    ) : (
      sello
    );
  }

  if (estado === "ERROR") {
    return (
      <Badge
        variant="outline"
        title={pedido.facturaElectronicaError ?? undefined}
        className="border-destructive/40 font-mono text-rotulo font-bold text-destructive-soft"
      >
        Error
      </Badge>
    );
  }

  return <span className="font-mono text-rotulo text-muted-foreground">Sin factura</span>;
}

function EnlaceTirilla({ id, compacto }: { id: string; compacto?: boolean }) {
  return (
    <a
      href={`/imprimir/pedido/${id}`}
      target="_blank"
      rel="noopener"
      title="Reimprimir la tirilla"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--linea-30)] bg-[var(--panel-2)] px-3 text-xs font-bold text-foreground transition-colors hover:border-brand hover:text-brand",
        compacto ? "h-11 tableta:h-9" : "min-h-11 py-2",
      )}
    >
      <Printer className="size-3.5 shrink-0" />
      <span>Tirilla</span>
    </a>
  );
}

type VentasCobradasProps = {
  pedidos: CuentaCobrada[];
  /** Si el negocio está en condiciones de emitir factura electrónica. */
  puedeFacturar: boolean;
  /** Cuántas hubo en total, que puede ser más que las que llegaron. */
  total: number;
  tope: number;
  jornada: Date;
  esHoy: boolean;
  timeZone: string;
};

export function VentasCobradas({
  pedidos,
  puedeFacturar,
  total,
  tope,
  jornada,
  esHoy,
  timeZone,
}: VentasCobradasProps) {
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState("");
  const [metodo, setMetodo] = useState("");
  const [dian, setDian] = useState("");
  const [pagina, setPagina] = useState(0);

  const anterior = formatBusinessDate(new Date(jornada.getTime() - DIA_MS));

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const soloDigitos = q.replace(/\D/g, "");

    return pedidos.filter((p) => {
      if (tipo && p.type !== tipo) return false;
      if (metodo && !p.payments.some((pago) => pago.method === metodo)) return false;
      if (dian && estadoDianDe(p) !== dian) return false;
      if (!q) return true;

      // El número de pedido solo cuando se escribieron dígitos: si no, buscar
      // "12" traería a "Mesa 12" y al pedido 12, que son cosas distintas.
      if (soloDigitos && String(p.code) === soloDigitos) return true;
      if (soloDigitos && p.docNumber && p.docNumber.includes(soloDigitos)) return true;
      if (soloDigitos && p.customerPhone && p.customerPhone.includes(soloDigitos)) return true;
      if (p.customerName && normalizar(p.customerName).includes(q)) return true;
      if (normalizar(destinoDe(p)).includes(q)) return true;
      return false;
    });
  }, [pedidos, busqueda, tipo, metodo, dian]);

  // Un filtro nuevo con la página cuarta puesta muestra una tabla vacía que
  // parece un error. Se recorta en vez de guardarlo en un efecto.
  const ultimaPagina = Math.max(0, Math.ceil(filtrados.length / POR_PAGINA) - 1);
  const paginaActual = Math.min(pagina, ultimaPagina);
  const desde = paginaActual * POR_PAGINA;
  const visibles = filtrados.slice(desde, desde + POR_PAGINA);

  const cambiarFiltro = (aplicar: () => void) => {
    aplicar();
    setPagina(0);
  };

  const cobradoCop = filtrados.reduce((suma, p) => suma + p.totalCop, 0);

  return (
    <section className="space-y-4" aria-label="Cuentas cobradas">
      {/* ── Encabezado de la sección y navegación de jornada ── */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-dashed border-[var(--linea-30)] pb-3">
        <div>
          <h2 className="font-display text-lg font-black uppercase tracking-tight text-foreground">
            Cuentas cobradas
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Jornada del{" "}
            <span className="font-mono font-bold text-foreground">
              {formatBusinessDate(jornada)}
            </span>
            {esHoy && <span className="ml-2 font-semibold text-brand">● En curso</span>}
          </p>
        </div>

        <nav className="flex items-center gap-2" aria-label="Cambiar de jornada">
          <Link
            href={`/caja?vista=cobradas&jornada=${anterior}`}
            className="inline-flex min-h-11 tableta:min-h-9 items-center gap-1.5 rounded-lg border border-[var(--linea-30)] bg-[var(--panel-2)] px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Día anterior
          </Link>
          {!esHoy && (
            <Link
              href="/caja?vista=cobradas"
              className="inline-flex min-h-11 tableta:min-h-9 items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/10 px-3 text-xs font-bold text-brand transition-colors hover:bg-brand/20"
            >
              Ver hoy <ArrowRight className="size-3.5" />
            </Link>
          )}
        </nav>
      </div>

      {/* ── Búsqueda y filtros ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => cambiarFiltro(() => setBusqueda(e.target.value))}
            placeholder="Buscar por cliente, teléfono, documento o pedido…"
            aria-label="Buscar una cuenta cobrada"
            className="h-11 pl-9 text-sm tableta:h-10"
          />
        </div>

        <Filtro valor={tipo} onCambiar={(v) => cambiarFiltro(() => setTipo(v))} etiqueta="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS).map(([clave, nombre]) => (
            <option key={clave} value={clave}>
              {nombre}
            </option>
          ))}
        </Filtro>

        <Filtro valor={metodo} onCambiar={(v) => cambiarFiltro(() => setMetodo(v))} etiqueta="Pago">
          <option value="">Todos los pagos</option>
          {Object.entries(METODOS).map(([clave, nombre]) => (
            <option key={clave} value={clave}>
              {nombre}
            </option>
          ))}
        </Filtro>

        <Filtro valor={dian} onCambiar={(v) => cambiarFiltro(() => setDian(v))} etiqueta="Factura">
          <option value="">Toda factura</option>
          <option value="EMITIDA">Emitida</option>
          <option value="PENDIENTE">Sin factura</option>
          <option value="ERROR">Con error</option>
        </Filtro>
      </div>

      {/* ── Recuento ── */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <p>
          <span className="numeral font-bold text-foreground">{filtrados.length}</span>{" "}
          {filtrados.length === 1 ? "cuenta" : "cuentas"}
          {filtrados.length !== pedidos.length && ` de ${pedidos.length}`} ·{" "}
          <span className="numeral font-bold text-foreground">{formatCop(cobradoCop)}</span>
        </p>
        {total > tope && (
          <p className="text-warning-soft">
            La jornada tuvo {total} cuentas y acá entran las {tope} últimas.
          </p>
        )}
      </div>

      {filtrados.length === 0 ? (
        <Vacio
          titulo={pedidos.length === 0 ? "Todavía no se cobró nada" : "Nada con esos filtros"}
          descripcion={
            pedidos.length === 0
              ? "Las cuentas que se cobren en esta jornada van a aparecer acá para poder reimprimirlas o facturarlas."
              : "Probá con otro nombre, otro medio de pago, o mirá otra jornada."
          }
          icono={<Receipt />}
        />
      ) : (
        <>
          {/* ── Tablet y escritorio: tabla ── */}
          <div className="hidden rounded-lg border border-[var(--linea-16)] bg-[var(--panel)] tableta:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="numeral text-muted-foreground">
                      {p.closedAt ? formatTimeInTimeZone(p.closedAt, timeZone) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{destinoDe(p)}</span>
                      <span className="ml-2 font-mono text-rotulo text-muted-foreground">
                        #{p.code} · {TIPOS[p.type] ?? p.type}
                        {p.channel === "QR" && " · QR"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      {p.customerName?.trim() ? (
                        <span className="font-medium">{p.customerName}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {p.docNumber && (
                        <span className="ml-2 font-mono text-rotulo text-muted-foreground">
                          {p.docType ?? "CC"} {p.docNumber}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{metodosDe(p)}</TableCell>
                    <TableCell className="numeral text-right font-bold">
                      {formatCop(p.totalCop)}
                    </TableCell>
                    <TableCell>
                      <SelloDian pedido={p} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {puedeFacturar && estadoDianDe(p) !== "EMITIDA" && (
                          <BotonFacturar pedido={p} />
                        )}
                        {puedeFacturar && estadoDianDe(p) === "EMITIDA" && !p.notaCreditoCufe && (
                          <BotonNotaCredito pedido={p} />
                        )}
                        <EnlaceTirilla id={p.id} compacto />
                        <Button asChild variant="ghost" size="sm" className="h-9 text-xs">
                          <Link href={`/pedido/${p.id}`}>Detalle</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* ── Teléfono: tarjetas. Siete columnas no se leen en 360px. ── */}
          <ul className="space-y-2.5 tableta:hidden">
            {visibles.map((p) => (
              <li
                key={p.id}
                className="space-y-2.5 rounded-lg border border-[var(--linea-16)] bg-[var(--panel)] p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{destinoDe(p)}</p>
                    <p className="font-mono text-rotulo text-muted-foreground">
                      #{p.code} · {TIPOS[p.type] ?? p.type} ·{" "}
                      {p.closedAt ? formatTimeInTimeZone(p.closedAt, timeZone) : "—"}
                    </p>
                  </div>
                  <span className="numeral shrink-0 text-lg font-black text-foreground">
                    {formatCop(p.totalCop)}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  {p.customerName?.trim() ? p.customerName : "Sin nombre"} · {metodosDe(p)}
                </p>

                <div className="flex items-center justify-between gap-2">
                  <SelloDian pedido={p} />
                  <div className="flex items-center gap-2">
                    {puedeFacturar && estadoDianDe(p) !== "EMITIDA" && <BotonFacturar pedido={p} />}
                    {puedeFacturar && estadoDianDe(p) === "EMITIDA" && !p.notaCreditoCufe && (
                      <BotonNotaCredito pedido={p} />
                    )}
                    <EnlaceTirilla id={p.id} />
                    <Button asChild variant="ghost" size="sm" className="min-h-11 text-xs">
                      <Link href={`/pedido/${p.id}`}>Detalle</Link>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* ── Paginado ── */}
          {ultimaPagina > 0 && (
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-rotulo text-muted-foreground">
                {desde + 1}–{Math.min(desde + POR_PAGINA, filtrados.length)} de {filtrados.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaActual === 0}
                  onClick={() => setPagina(paginaActual - 1)}
                  className="min-h-11 text-xs tableta:min-h-9"
                >
                  <ArrowLeft className="size-3.5" /> Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaActual >= ultimaPagina}
                  onClick={() => setPagina(paginaActual + 1)}
                  className="min-h-11 text-xs tableta:min-h-9"
                >
                  Siguiente <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Filtro({
  valor,
  onCambiar,
  etiqueta,
  children,
}: {
  valor: string;
  onCambiar: (valor: string) => void;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onCambiar(e.target.value)}
      aria-label={`Filtrar por ${etiqueta.toLowerCase()}`}
      className={cn(
        "h-11 shrink-0 rounded-lg border border-[var(--linea-30)] bg-[var(--input-bg)] px-3 text-xs font-semibold text-foreground tableta:h-10",
        valor && "border-brand/50 text-brand",
      )}
    >
      {children}
    </select>
  );
}
