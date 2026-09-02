"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CashAccount, CashMovementType } from "@/generated/prisma/enums";
import { abrirCaja, cerrarCaja, registrarMovimiento } from "@/features/caja/actions";
import { esSalidaDeDinero } from "@/features/caja/reglas";
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

export function AbrirCaja({ cajas }: { cajas: { id: string; name: string }[] }) {
  const [estado, accion] = useActionState(abrirCaja, ESTADO_INICIAL);
  const [base, setBase] = useState("");
  const [banco, setBanco] = useState("");

  const baseCop = Number(base.replace(/\D/g, "")) || 0;
  const bancoCop = Number(banco.replace(/\D/g, "")) || 0;

  /**
   * Sin ninguna caja libre no hay formulario que llenar, y decirlo es más útil
   * que un botón que va a fallar: las dos salidas —que alguien cierre su turno, o
   * crear otra caja— las tiene que tomar una persona distinta según el caso.
   */
  if (cajas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todas las cajas del negocio tienen un turno abierto. Pedile a quien la esté
        usando que cierre el suyo, o creá otra caja en Configuración → Cajas.
      </p>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      <ErrorDeAccion estado={estado} />

      {/* Con una sola caja no se pregunta: elegir entre una opción no es una
          decisión, es un clic de más en la pantalla que se abre todas las noches. */}
      {cajas.length > 1 ? (
        <div className="space-y-1.5">
          <Label htmlFor="cashRegisterId">¿En qué caja estás?</Label>
          <select
            id="cashRegisterId"
            name="cashRegisterId"
            className="h-11 tableta:h-10 w-full rounded-xl border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 text-sm focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
            required
          >
            {cajas.map((caja) => (
              <option key={caja.id} value={caja.id}>
                {caja.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Todo lo que cobres esta noche cae en el cajón de esta caja.
          </p>
        </div>
      ) : (
        <input type="hidden" name="cashRegisterId" value={cajas[0].id} />
      )}

      <div className="space-y-1.5">
        <Label htmlFor="base">Base en efectivo</Label>
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

      {/* El segundo saldo. Sin esto, todo lo que entra por datáfono aparece al
          cierre como sobrante sobre una base de cero. */}
      <div className="space-y-1.5">
        <Label htmlFor="banco">Base en bancos</Label>
        <div className="relative">
          <span
            aria-hidden
            className="numeral pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
          >
            $
          </span>
          <Input
            id="banco"
            name="openingBankCop"
            inputMode="numeric"
            value={banco}
            onChange={(e) => setBanco(e.target.value.replace(/\D/g, ""))}
            placeholder="0"
            className="numeral pl-7 text-base"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {bancoCop > 0 ? (
            <>
              Arrancás con <span className="numeral font-bold text-foreground">{formatCop(bancoCop)}</span>{" "}
              en la cuenta. Contra eso se cuadra lo cobrado con tarjeta y billeteras.
            </>
          ) : (
            "Lo que hay en la cuenta al empezar. Dejalo en cero si no la vas a cuadrar."
          )}
        </p>
      </div>

      <Enviar className="w-full">Abrir caja</Enviar>
    </form>
  );
}

export function CerrarCaja({
  esperadoCop,
  esperadoBancoCop,
}: {
  esperadoCop: number;
  esperadoBancoCop: number;
}) {
  const [estado, accion] = useActionState(cerrarCaja, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <ErrorDeAccion estado={estado} />

      {estado.ok && estado.data && (
        <Alert role="status">
          <AlertDescription>
            Caja cerrada. Diferencia en efectivo:{" "}
            <strong className="numeral">{formatCop(estado.data.differenceCop ?? 0)}</strong> · en
            bancos:{" "}
            <strong className="numeral">{formatCop(estado.data.differenceBankCop ?? 0)}</strong>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="contado">¿Cuánto contaste en el cajón?</Label>
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
        <Label htmlFor="contadoBanco">¿Cuánto dice la cuenta?</Label>
        <Input
          id="contadoBanco"
          name="countedBankCop"
          inputMode="numeric"
          placeholder="0"
          autoComplete="off"
          required
        />
        <p className="text-muted-foreground text-xs">
          El saldo de la cuenta del negocio. El sistema espera{" "}
          <span className="numeral">{formatCop(esperadoBancoCop)}</span>.
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

/**
 * El movimiento de dinero que no es una venta.
 *
 * Dos cosas que antes no se preguntaban y son la misma pregunta desde dos lados:
 * **de dónde sale la plata** (el cajón o la cuenta) y **quién autoriza que salga**
 * (la clave del propietario). El gasto pagado por transferencia descontaba del
 * cajón, y cualquiera con acceso a la caja podía registrar una salida.
 *
 * La clave se pide solo cuando el movimiento saca plata, y el campo aparece
 * únicamente entonces: pedirla para registrar una entrada sería enseñarle a la
 * gente a tenerla escrita al lado del teclado. La verificación real está en la
 * acción; esto es para que la pantalla no mienta.
 */
export function Movimiento({ clavePuesta }: { clavePuesta: boolean }) {
  const [estado, accion] = useActionState(registrarMovimiento, ESTADO_INICIAL);
  const [tipo, setTipo] = useState<string>(CashMovementType.EGRESO);
  const [monto, setMonto] = useState("");

  const esSalida = esSalidaDeDinero(tipo, Number(monto.replace(/[^\d-]/g, "")) || 0);

  return (
    <form action={accion} className="space-y-3">
      <ErrorDeAccion estado={estado} />

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem]">
        <div className="space-y-1.5">
          <Label htmlFor="tipo">Tipo</Label>
          <select
            id="tipo"
            name="type"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="h-11 tableta:h-10 w-full rounded-xl border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 text-sm focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
          >
            {Object.values(CashMovementType).map((t) => (
              <option key={t} value={t}>
                {TIPOS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cuenta">¿De dónde sale?</Label>
          <select
            id="cuenta"
            name="account"
            defaultValue={CashAccount.EFECTIVO}
            className="h-11 tableta:h-10 w-full rounded-xl border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 text-sm focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
          >
            <option value={CashAccount.EFECTIVO}>Efectivo del cajón</option>
            <option value={CashAccount.BANCO}>Cuenta de bancos</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="monto">Monto</Label>
          <Input
            id="monto"
            name="amountCop"
            inputMode="numeric"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
          />
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

      {esSalida &&
        (clavePuesta ? (
          <div className="space-y-1.5">
            <Label htmlFor="clave">Clave de salidas</Label>
            <Input
              id="clave"
              name="clave"
              type="password"
              autoComplete="off"
              required
              placeholder="La clave que puso el propietario"
            />
          </div>
        ) : (
          <p className="text-xs text-warning-soft">
            Este negocio todavía no tiene clave de salidas. El propietario puede
            ponerla en Configuración → Cajas y salidas de dinero.
          </p>
        ))}

      <Enviar>Registrar movimiento</Enviar>
    </form>
  );
}
