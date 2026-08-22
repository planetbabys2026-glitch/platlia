"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, Power } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { abrirDomiciliosQr } from "@/features/domicilios/actions";
import { cn } from "@/lib/utils";

/**
 * Abrir y cerrar la recepción de domicilios por QR.
 *
 * Existe porque un comensal podía mandar un domicilio a cualquier hora: con la
 * caja cerrada, el local vacío y nadie en la cocina. El pedido no fallaba —entraba
 * perfecto— y se quedaba esperando a que alguien lo encontrara a la mañana
 * siguiente, con un cliente del otro lado que ya había dado su dirección.
 *
 * Lo mueve el cajero al abrir y al cerrar el turno, así que aparece en las dos
 * pantallas donde está esa persona: `/caja` y `/domicilios`. Es el mismo
 * componente en las dos para que no puedan mostrar estados distintos.
 *
 * **No dice solo "activado".** Un interruptor que solo se pinta de color deja al
 * cajero adivinando de qué lado está encendido; este dice qué está pasando ahora
 * —"estás recibiendo pedidos"— y el botón dice qué va a pasar si lo toca.
 */
export function InterruptorDomiciliosQr({
  abierto,
  className,
}: {
  abierto: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  const cambiar = async () => {
    setCargando(true);
    try {
      // El valor va explícito y no como "lo contrario de lo que veo": si dos
      // personas lo tocan a la vez desde sus dos pantallas, un alternar deja el
      // estado al azar, y acá el azar es un local que se cree cerrado recibiendo
      // pedidos.
      const res = await abrirDomiciliosQr(undefined, { abierto: !abierto });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.data?.abierto
          ? "Listo: el menú QR ya recibe domicilios."
          : "Cerrado: el menú QR dejó de recibir domicilios.",
      );
      router.refresh();
    } finally {
      setCargando(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3",
        abierto
          ? "border-success/40 bg-success/[0.06]"
          : "border-warning/40 bg-warning/[0.06]",
        className,
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <Bike
          className={cn("size-4 shrink-0 mt-0.5", abierto ? "text-success-soft" : "text-warning-soft")}
        />
        <div className="min-w-0">
          <p className={cn("text-sm font-bold", abierto ? "text-success-soft" : "text-warning-soft")}>
            {abierto ? "Estás recibiendo domicilios por QR" : "No estás recibiendo domicilios por QR"}
          </p>
          <p className="text-xs text-muted-foreground">
            {abierto
              ? "Quien escanee el código puede pedir a domicilio. Cerralo al terminar el turno."
              : "Quien escanee el código ve la carta, pero no puede pedir a domicilio."}
          </p>
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        variant={abierto ? "outline" : "default"}
        disabled={cargando}
        onClick={cambiar}
        className={cn("h-9 text-xs font-bold gap-1.5 shrink-0", !abierto && "bg-brand hover:bg-brand/90 text-brand-foreground")}
      >
        <Power className="size-3.5" />
        {cargando ? "Un momento…" : abierto ? "Cerrar domicilios" : "Abrir domicilios"}
      </Button>
    </div>
  );
}
