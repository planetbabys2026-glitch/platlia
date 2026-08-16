import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * La barra de "se te acaba la licencia", dentro de la aplicación.
 *
 * El correo se pierde: se va a spam, lo abre quien no paga, o llega un domingo.
 * Esto aparece donde la persona ya está mirando, todos los días, hasta que
 * renueva. Por eso mismo hay que tener cuidado con a quién se le muestra —un
 * mesero no puede hacer nada con este aviso y solo le quita una franja de
 * pantalla— y desde cuándo: aparece recién a tres días del corte, que es cuando
 * hay algo que hacer.
 */
export function AvisoLicencia({
  diasRestantes,
  puedeFacturar,
}: {
  diasRestantes: number;
  puedeFacturar: boolean;
}) {
  const cortado = diasRestantes <= 0;

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-center text-xs",
        cortado
          ? "border-destructive/40 bg-destructive/15 text-destructive-soft"
          : "border-warning/40 bg-warning/15 text-warning-soft",
      )}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
        {cortado
          ? "El servicio está cortado."
          : diasRestantes === 1
            ? "Mañana se corta el servicio."
            : `Quedan ${diasRestantes} días de servicio.`}
      </span>

      {puedeFacturar ? (
        <Link href="/facturacion" className="font-bold underline underline-offset-4">
          Renovar la licencia
        </Link>
      ) : (
        <span className="text-muted-foreground">Avisale a quien administra el negocio.</span>
      )}
    </div>
  );
}
