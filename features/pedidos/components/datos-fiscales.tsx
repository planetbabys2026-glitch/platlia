"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TIPOS_DE_DOCUMENTO } from "@/lib/billing/factus-habilitacion";

/**
 * Los datos del cliente para la factura electrónica, dentro del cobro.
 *
 * Van acá y no al abrir la mesa por dos razones. La primera es de negocio: la
 * facturación electrónica no es de todas las empresas, y pedirle la cédula a
 * alguien que va a recibir un tiquete es fricción pura. La segunda es de
 * consistencia: viajan en el mismo envío que el pago, así que no existe el estado
 * intermedio de un pedido con datos fiscales y sin cobrar, ni al revés.
 *
 * Con `puedeFacturar` en false no se renderiza nada: el cobro queda igual que
 * siempre. Ese booleano lo calcula el servidor con `puedeFacturarElectronicamente`;
 * las credenciales de Factus nunca bajan al navegador.
 *
 * Sin marcar la casilla, la venta se factura a Consumidor Final —el documento
 * 222222222222 de la DIAN— y no se pide ningún dato.
 *
 * Los campos son controlados **y** llevan `name`, porque los dos lugares que
 * cobran funcionan distinto: la caja envía un `<form>` y el FormData los levanta
 * solo, mientras que el POS arma el objeto a mano y necesita leer el estado.
 */

export type DatosFiscalesValor = {
  facturaElectronica: boolean;
  docType: string;
  docNumber: string;
  customerEmail: string;
};

/**
 * El valor inicial a partir del pedido. Si ya trae documento es porque alguien
 * pidió factura antes: la casilla arranca marcada para no perder lo escrito.
 */
export function valorFiscalInicial(pedido: {
  docType?: string | null;
  docNumber?: string | null;
  customerEmail?: string | null;
}): DatosFiscalesValor {
  return {
    facturaElectronica: Boolean(pedido.docNumber),
    docType: pedido.docType ?? "CC",
    docNumber: pedido.docNumber ?? "",
    customerEmail: pedido.customerEmail ?? "",
  };
}

export function DatosFiscales({
  puedeFacturar,
  orderId,
  valor,
  onChange,
}: {
  puedeFacturar: boolean;
  /** Solo para que los `id` de los campos sean únicos cuando hay varias cuentas en pantalla. */
  orderId: string;
  valor: DatosFiscalesValor;
  onChange: (valor: DatosFiscalesValor) => void;
}) {
  if (!puedeFacturar) return null;

  const cambiar = (parcial: Partial<DatosFiscalesValor>) => onChange({ ...valor, ...parcial });

  return (
    <div className="border-border/80 space-y-3 rounded-lg border border-dashed p-3">
      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
        <input
          type="checkbox"
          name="facturaElectronica"
          checked={valor.facturaElectronica}
          onChange={(e) => cambiar({ facturaElectronica: e.target.checked })}
          className="accent-brand size-4"
        />
        Facturación electrónica
      </label>

      {!valor.facturaElectronica ? (
        <p className="text-muted-foreground text-xs">
          Sin marcar, la venta se factura a <strong>Consumidor Final</strong>.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`docType-${orderId}`} className="text-xs font-medium">
                Tipo de documento
              </Label>
              <select
                id={`docType-${orderId}`}
                name="docType"
                value={valor.docType}
                onChange={(e) => cambiar({ docType: e.target.value })}
                className="border-input bg-card focus-visible:ring-ring h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
              >
                {TIPOS_DE_DOCUMENTO.map((tipo) => (
                  <option key={tipo.valor} value={tipo.valor}>
                    {tipo.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`docNumber-${orderId}`} className="text-xs font-medium">
                Número de documento
              </Label>
              <Input
                id={`docNumber-${orderId}`}
                name="docNumber"
                inputMode="numeric"
                maxLength={20}
                value={valor.docNumber}
                onChange={(e) => cambiar({ docNumber: e.target.value })}
                required
                className="numeral h-11 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor={`customerEmail-${orderId}`} className="text-xs font-medium">
              Correo para enviar la factura
            </Label>
            <Input
              id={`customerEmail-${orderId}`}
              name="customerEmail"
              type="email"
              maxLength={160}
              value={valor.customerEmail}
              onChange={(e) => cambiar({ customerEmail: e.target.value })}
              required
              className="h-11 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
