"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  consultarRangosDeNumeracion,
  gestionarPaqueteFacturacionElectronica,
  registrarCompraDocumentos,
} from "@/features/superadmin/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";

type Bolsa = {
  comprados: number;
  asignados: number;
  consumidos: number;
  sinAsignar: number;
  invertidoCop: number;
};

type Compra = {
  id: string;
  cantidad: number;
  costoCop: number;
  nota: string | null;
  compradoEn: string;
};

type Negocio = {
  id: string;
  nombre: string;
  nit: string | null;
  habilitada: boolean;
  asignados: number;
  consumidos: number;
  numberingRangeId: number | null;
  numberingRangeIdNc: number | null;
  municipalityCode: string | null;
};

type Rango = {
  id: number;
  document: string;
  prefix?: string | null;
  from?: number | null;
  to?: number | null;
  current?: number | null;
  resolution_number?: string | null;
};

/** Factura de venta y nota crédito son resoluciones distintas de la DIAN. */
const esDeFactura = (r: Rango) => /factura/i.test(r.document ?? "");
const esDeNotaCredito = (r: Rango) => /nota\s*cr/i.test(r.document ?? "");

export function VistaFacturacion({
  bolsa,
  compras,
  negocios,
  plataformaConfigurada,
}: {
  bolsa: Bolsa;
  compras: Compra[];
  negocios: Negocio[];
  plataformaConfigurada: boolean;
}) {
  const [rangos, setRangos] = useState<Rango[] | null>(null);
  const [editando, setEditando] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      {!plataformaConfigurada && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-soft">
          <p className="font-bold">La cuenta de Factus de la plataforma no está configurada.</p>
          <p className="mt-1 text-xs">
            Faltan <code className="font-mono">FACTUS_CLIENT_ID</code>,{" "}
            <code className="font-mono">FACTUS_CLIENT_SECRET</code>,{" "}
            <code className="font-mono">FACTUS_USERNAME</code> o{" "}
            <code className="font-mono">FACTUS_PASSWORD</code> en el entorno. Sin eso ningún negocio
            puede emitir, por más documentos que se le asignen.
          </p>
        </div>
      )}

      <Bolsa bolsa={bolsa} />
      <RegistrarCompra />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-black uppercase tracking-tight text-foreground">
              Negocios
            </h2>
            <p className="text-xs text-muted-foreground">
              Quién factura, con cuántos documentos y con qué resolución de la DIAN.
            </p>
          </div>
          <ProbarConexion onRangos={setRangos} habilitado={plataformaConfigurada} />
        </div>

        {rangos && (
          <div className="rounded-lg border border-[var(--linea-16)] bg-[var(--panel-2)] p-3 text-xs">
            <p className="mb-2 font-bold text-foreground">
              Rangos autorizados en la cuenta de Factus
            </p>
            {rangos.length === 0 ? (
              <p className="text-muted-foreground">
                La conexión funciona pero la cuenta no tiene rangos activos.
              </p>
            ) : (
              <ul className="space-y-1 font-mono text-muted-foreground">
                {rangos.map((r) => (
                  <li key={r.id}>
                    <span className="font-bold text-brand">#{r.id}</span> {r.document} ·{" "}
                    {r.prefix ?? ""}
                    {r.from !== null && r.from !== undefined && ` ${r.from}–${r.to}`}
                    {r.current ? ` · va en ${r.current}` : ""}
                    {r.resolution_number ? ` · res. ${r.resolution_number}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="rounded-lg border border-[var(--linea-16)] bg-[var(--panel)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Negocio</TableHead>
                <TableHead>NIT</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead className="text-right">Asignados</TableHead>
                <TableHead className="text-right">Emitidos</TableHead>
                <TableHead className="text-right">Quedan</TableHead>
                <TableHead>Rangos FV / NC</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {negocios.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-semibold">{n.nombre}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{n.nit ?? "—"}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 font-mono text-rotulo font-bold",
                        n.habilitada
                          ? "bg-success/15 text-success-soft"
                          : "bg-[var(--panel-2)] text-muted-foreground",
                      )}
                    >
                      {n.habilitada ? "Activo" : "Apagado"}
                    </span>
                  </TableCell>
                  <TableCell className="numeral text-right">{n.asignados}</TableCell>
                  <TableCell className="numeral text-right">{n.consumidos}</TableCell>
                  <TableCell
                    className={cn(
                      "numeral text-right font-bold",
                      n.habilitada && n.asignados - n.consumidos <= 0 && "text-destructive-soft",
                    )}
                  >
                    {Math.max(0, n.asignados - n.consumidos)}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {n.numberingRangeId ? `#${n.numberingRangeId}` : "—"} /{" "}
                    {n.numberingRangeIdNc ? `#${n.numberingRangeIdNc}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 text-xs"
                      onClick={() => setEditando(editando === n.id ? null : n.id)}
                    >
                      {editando === n.id ? "Cerrar" : "Asignar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {editando && (
          <FormularioNegocio
            negocio={negocios.find((n) => n.id === editando)!}
            sinAsignar={bolsa.sinAsignar}
            rangos={rangos}
            onListo={() => setEditando(null)}
          />
        )}
      </section>

      <HistorialCompras compras={compras} />
    </div>
  );
}

function Bolsa({ bolsa }: { bolsa: Bolsa }) {
  return (
    <section className="grid grid-cols-2 gap-3 tableta:grid-cols-4">
      <Cifra rotulo="Comprados" valor={bolsa.comprados} pie={formatCop(bolsa.invertidoCop)} />
      <Cifra rotulo="Asignados" valor={bolsa.asignados} pie="repartidos entre negocios" />
      <Cifra rotulo="Emitidos" valor={bolsa.consumidos} pie="facturas y notas crédito" />
      <Cifra
        rotulo="Sin asignar"
        valor={bolsa.sinAsignar}
        pie="disponibles para repartir"
        alerta={bolsa.sinAsignar === 0}
      />
    </section>
  );
}

function Cifra({
  rotulo,
  valor,
  pie,
  alerta,
}: {
  rotulo: string;
  valor: number;
  pie: string;
  alerta?: boolean;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-[var(--linea-16)] bg-[var(--panel)] p-4">
      <p className="font-mono text-rotulo uppercase tracking-[0.14em] text-muted-foreground">
        {rotulo}
      </p>
      <p
        className={cn(
          "numeral text-3xl font-bold leading-none",
          alerta ? "text-destructive-soft" : "text-foreground",
        )}
      >
        {valor}
      </p>
      <p className="text-xs text-muted-foreground">{pie}</p>
    </div>
  );
}

function RegistrarCompra() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [nota, setNota] = useState("");

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    iniciar(async () => {
      const res = await registrarCompraDocumentos(ESTADO_INICIAL, {
        cantidad: Number(cantidad),
        costoCop: Number(costo) || 0,
        nota: nota.trim() || null,
      });
      if (res.ok) {
        toast.success(`${cantidad} documentos sumados a la bolsa.`);
        setCantidad("");
        setCosto("");
        setNota("");
        router.refresh();
      } else {
        toast.error(res.error || "No se pudo registrar la compra.");
      }
    });
  };

  return (
    <section className="space-y-3 rounded-lg border border-[var(--linea-16)] bg-[var(--panel)] p-5">
      <div>
        <h2 className="font-display text-xl font-black uppercase tracking-tight text-foreground">
          Registrar una compra
        </h2>
        <p className="text-xs text-muted-foreground">
          Cada paquete que le compramos a Factus. Es contra esto que se descuenta lo asignado.
        </p>
      </div>

      <form onSubmit={enviar} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="cantidad" className="text-xs font-semibold">
            Documentos
          </Label>
          <Input
            id="cantidad"
            required
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="1000"
            className="numeral h-10 w-32"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="costo" className="text-xs font-semibold">
            Costo (COP)
          </Label>
          <Input
            id="costo"
            inputMode="numeric"
            value={costo}
            onChange={(e) => setCosto(e.target.value)}
            placeholder="0"
            className="numeral h-10 w-40"
          />
        </div>
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="nota" className="text-xs font-semibold">
            Nota
          </Label>
          <Input
            id="nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Factura de Factus, plan, etc."
            className="h-10"
          />
        </div>
        <Button type="submit" disabled={pendiente} className="h-10 text-xs font-bold">
          {pendiente ? "Guardando…" : "Sumar a la bolsa"}
        </Button>
      </form>
    </section>
  );
}

function ProbarConexion({
  onRangos,
  habilitado,
}: {
  onRangos: (rangos: Rango[]) => void;
  habilitado: boolean;
}) {
  const [pendiente, iniciar] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pendiente || !habilitado}
      className="h-10 text-xs font-bold"
      onClick={() =>
        iniciar(async () => {
          const res = await consultarRangosDeNumeracion(ESTADO_INICIAL, {});
          if (res.ok) {
            onRangos(res.data.rangos as Rango[]);
            toast.success("Conexión con Factus correcta.");
          } else {
            toast.error(res.error || "No se pudo conectar con Factus.");
          }
        })
      }
    >
      {pendiente ? "Consultando…" : "Probar conexión y ver rangos"}
    </Button>
  );
}

function FormularioNegocio({
  negocio,
  sinAsignar,
  rangos,
  onListo,
}: {
  negocio: Negocio;
  sinAsignar: number;
  rangos: Rango[] | null;
  onListo: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [habilitar, setHabilitar] = useState(negocio.habilitada);
  const [sumar, setSumar] = useState("0");
  const [rango, setRango] = useState(negocio.numberingRangeId?.toString() ?? "");
  const [rangoNc, setRangoNc] = useState(negocio.numberingRangeIdNc?.toString() ?? "");
  const [municipio, setMunicipio] = useState(negocio.municipalityCode ?? "");
  const [motivo, setMotivo] = useState("");

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    iniciar(async () => {
      const res = await gestionarPaqueteFacturacionElectronica(ESTADO_INICIAL, {
        businessId: negocio.id,
        habilitar,
        sumarDocumentos: Number(sumar) || 0,
        numberingRangeId: rango.trim() === "" ? null : Number(rango),
        numberingRangeIdNc: rangoNc.trim() === "" ? null : Number(rangoNc),
        municipalityCode: municipio.trim() === "" ? null : municipio.trim(),
        motivo: motivo.trim(),
      });
      if (res.ok) {
        toast.success(`Facturación actualizada para ${negocio.nombre}.`);
        onListo();
        router.refresh();
      } else {
        toast.error(res.error || "No se pudo guardar.");
      }
    });
  };

  return (
    <form
      onSubmit={enviar}
      className="space-y-4 rounded-lg border border-brand/40 bg-[var(--panel)] p-5"
    >
      <h3 className="font-display text-lg font-black uppercase tracking-tight text-foreground">
        {negocio.nombre}
      </h3>

      <div className="space-y-2">
        <Label className="text-xs font-semibold">Módulo de facturación electrónica</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={habilitar ? "default" : "outline"}
            onClick={() => setHabilitar(true)}
            className={cn("h-10 flex-1 text-xs font-bold", habilitar && "bg-success text-white")}
          >
            Activo
          </Button>
          <Button
            type="button"
            variant={!habilitar ? "default" : "outline"}
            onClick={() => setHabilitar(false)}
            className={cn("h-10 flex-1 text-xs font-bold", !habilitar && "bg-muted text-foreground")}
          >
            Apagado
          </Button>
        </div>
      </div>

      <div className="grid gap-3 tableta:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="sumar" className="text-xs font-semibold">
            Sumar documentos
          </Label>
          <Input
            id="sumar"
            inputMode="numeric"
            value={sumar}
            onChange={(e) => setSumar(e.target.value)}
            className="numeral h-10"
          />
          <p className="text-rotulo text-muted-foreground">
            Quedan <span className="numeral font-bold text-foreground">{sinAsignar}</span> sin
            asignar.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="municipio" className="text-xs font-semibold">
            Código DANE del municipio
          </Label>
          <Input
            id="municipio"
            inputMode="numeric"
            maxLength={5}
            value={municipio}
            onChange={(e) => setMunicipio(e.target.value)}
            placeholder="05001"
            className="numeral h-10"
          />
        </div>
      </div>

      {/* Dos rangos y no uno: en Factus, "Factura de Venta" y "Nota Crédito" son
          resoluciones distintas de la DIAN. Emitir la nota con el rango de la
          factura le pone el consecutivo equivocado. */}
      <div className="grid gap-3 tableta:grid-cols-2">
        <SelectorDeRango
          id="rango-fv"
          etiqueta="Rango de facturas de venta"
          valor={rango}
          onCambiar={setRango}
          opciones={rangos?.filter(esDeFactura) ?? null}
        />
        <SelectorDeRango
          id="rango-nc"
          etiqueta="Rango de notas crédito"
          valor={rangoNc}
          onCambiar={setRangoNc}
          opciones={rangos?.filter(esDeNotaCredito) ?? null}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="motivo" className="text-xs font-semibold">
          Motivo (obligatorio)
        </Label>
        <Input
          id="motivo"
          required
          minLength={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej. Pagó el paquete de 500 documentos"
          className="h-10 text-xs"
        />
      </div>

      <Button type="submit" disabled={pendiente} className="h-10 w-full text-xs font-bold">
        {pendiente ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

function SelectorDeRango({
  id,
  etiqueta,
  valor,
  onCambiar,
  opciones,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambiar: (valor: string) => void;
  /** Null mientras no se haya probado la conexión: ahí se escribe a mano. */
  opciones: Rango[] | null;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-semibold">
        {etiqueta}
      </Label>
      {opciones && opciones.length > 0 ? (
        <select
          id={id}
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          className="h-10 w-full rounded-lg border border-[var(--linea-30)] bg-[var(--input-bg)] px-3 text-xs text-foreground"
        >
          <option value="">Sin asignar</option>
          {opciones.map((r) => (
            <option key={r.id} value={r.id}>
              #{r.id} · {r.prefix ?? ""}
              {r.from ? ` ${r.from}–${r.to}` : ""}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          inputMode="numeric"
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          placeholder="Probá la conexión para elegirlo"
          className="numeral h-10"
        />
      )}
    </div>
  );
}

function HistorialCompras({ compras }: { compras: Compra[] }) {
  if (compras.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-black uppercase tracking-tight text-foreground">
        Compras a Factus
      </h2>
      <div className="rounded-lg border border-[var(--linea-16)] bg-[var(--panel)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Documentos</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead>Nota</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {compras.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="numeral text-muted-foreground">{c.compradoEn}</TableCell>
                <TableCell className="numeral text-right font-bold">{c.cantidad}</TableCell>
                <TableCell className="numeral text-right">{formatCop(c.costoCop)}</TableCell>
                <TableCell className="text-muted-foreground">{c.nota ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
