"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CashMovementType } from "@/generated/prisma/enums";
import { abrirCaja, cerrarCaja, registrarMovimiento } from "@/features/caja/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";

const TIPOS: Record<string, string> = {
  INGRESO: "Entrada de dinero",
  EGRESO: "Gasto",
  RETIRO: "Retiro a la caja fuerte",
  AJUSTE: "Ajuste (puede ir negativo)",
};

function Enviar({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className={className} disabled={pending}>
      {pending ? "Un momento…" : children}
    </Button>
  );
}

function ErrorDeAccion({ estado }: { estado: { ok: boolean; error?: string } }) {
  if (estado.ok || !estado.error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{estado.error}</AlertDescription>
    </Alert>
  );
}

export function AbrirCaja() {
  const [estado, accion] = useActionState(abrirCaja, ESTADO_INICIAL);
  const [base, setBase] = useState("");

  const baseCop = Number(base.replace(/\D/g, "")) || 0;

  return (
    <form action={accion} className="space-y-4">
      <ErrorDeAccion estado={estado} />
      <div className="space-y-1.5">
        <Label htmlFor="base">Base del turno</Label>
        {/* La base es PLATA y no se veía como plata: un `0` pelado en un campo de
            texto. El peso adentro del campo y la cifra en la letra de los números
            —la misma con la que se lee cualquier importe del producto— es lo que
            hace que quien la teclea sepa de qué está hablando. */}
        <div className="relative">
          <span
            aria-hidden
            className="numeral pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
          >
            $
          </span>
          <Input
            id="base"
            name="openingFloatCop"
            inputMode="numeric"
            value={base}
            onChange={(e) => setBase(e.target.value.replace(/\D/g, ""))}
            placeholder="0"
            className="numeral pl-7 text-base"
            required
          />
        </div>
        {/* Se repite formateado: quien escribe "50000" tiene que poder confirmar
            de un vistazo que puso cincuenta mil y no cinco mil, que es el error
            que después aparece como diferencia en el arqueo. */}
        <p className="text-xs text-muted-foreground">
          {baseCop > 0 ? (
            <>
              Abrís con <span className="numeral font-bold text-foreground">{formatCop(baseCop)}</span>{" "}
              en el cajón para dar vuelto.
            </>
          ) : (
            "Lo que hay en el cajón para dar vuelto al empezar."
          )}
        </p>
      </div>
      <Enviar className="w-full">Abrir caja</Enviar>
    </form>
  );
}

export function CerrarCaja({ esperadoCop }: { esperadoCop: number }) {
  const [estado, accion] = useActionState(cerrarCaja, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <ErrorDeAccion estado={estado} />

      {estado.ok && estado.data && (
        <Alert role="status">
          <AlertDescription>
            Caja cerrada. Diferencia:{" "}
            <strong className="numeral">{formatCop(estado.data.differenceCop ?? 0)}</strong>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="contado">¿Cuánto contaste?</Label>
        {/* Sin el esperado precargado a propósito: si el campo ya trae la cifra
            que debería dar, nadie cuenta y la diferencia nunca aparece. */}
        <Input
          id="contado"
          name="countedCashCop"
          inputMode="numeric"
          placeholder="0"
          autoComplete="off"
          required
        />
        <p className="text-muted-foreground text-xs">
          Contá el efectivo del cajón antes de escribir. El sistema espera{" "}
          <span className="numeral">{formatCop(esperadoCop)}</span>.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notas">Notas</Label>
        <Input id="notas" name="notes" placeholder="opcional" />
      </div>

      <Enviar className="w-full">Cerrar caja</Enviar>
    </form>
  );
}

export function Movimiento() {
  const [estado, accion] = useActionState(registrarMovimiento, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <ErrorDeAccion estado={estado} />

      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div className="space-y-1.5">
          <Label htmlFor="tipo">Tipo</Label>
          <select
            id="tipo"
            name="type"
            defaultValue={CashMovementType.EGRESO}
            className="h-11 tableta:h-10 w-full rounded-xl border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 text-sm focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
          >
            {Object.values(CashMovementType).map((tipo) => (
              <option key={tipo} value={tipo}>
                {TIPOS[tipo]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="monto">Monto</Label>
          <Input id="monto" name="amountCop" inputMode="numeric" required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="concepto">¿Para qué fue?</Label>
        <Input
          id="concepto"
          name="concept"
          required
          minLength={3}
          placeholder="Hielo, domicilio, propina al mensajero…"
        />
      </div>

      <Enviar>Registrar movimiento</Enviar>
    </form>
  );
}
