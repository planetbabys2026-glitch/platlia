"use client";

import Link from "next/link";
import { Bell, ChefHat, Bike, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAvisos } from "@/features/avisos/proveedor";
import { cn } from "@/lib/utils";

/**
 * Los últimos avisos, para quien no estaba mirando.
 *
 * Un toast dura tres segundos y en un bar eso es exactamente el tiempo que se
 * tarda en darse vuelta. La campana es la red debajo: no persiste en la base
 * —un aviso de cocina caduca en minutos y no vale una tabla— pero cubre el caso
 * real, que es haber estado de espaldas.
 */
export function Campana({ className }: { className?: string }) {
  const { avisos, noLeidos, sonido, alternarSonido, marcarLeidos } = useAvisos();

  return (
    <DropdownMenu onOpenChange={(abierto) => abierto && marcarLeidos()}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={
            noLeidos > 0 ? `Avisos, ${noLeidos} sin leer` : "Avisos"
          }
          className={cn("relative h-11 w-11 md:h-9 md:w-9 text-muted-foreground", className)}
        >
          <Bell className="h-4.5 w-4.5" />
          {noLeidos > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brasa)] opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--brasa)]" />
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <div className="flex items-center justify-between gap-2 pr-1">
          <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.16em]">
            Avisos
          </DropdownMenuLabel>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={alternarSonido}
            aria-pressed={sonido}
            className="h-8 gap-1.5 text-[11px] text-muted-foreground"
          >
            {sonido ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            {sonido ? "Con sonido" : "Silenciado"}
          </Button>
        </div>

        <DropdownMenuSeparator />

        {avisos.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Todavía no entró ningún pedido.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {avisos.map((aviso) => {
              const Icono = aviso.tipo === "DOMICILIO_NUEVO" ? Bike : ChefHat;
              return (
                <li key={aviso.id}>
                  <Link
                    href={aviso.href}
                    className="flex items-start gap-2.5 rounded-md px-2 py-2.5 transition-colors hover:bg-[var(--panel-2)]"
                  >
                    <Icono className="mt-0.5 size-4 shrink-0 text-[var(--brasa)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {aviso.titulo}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {aviso.detalle}
                      </span>
                    </span>
                    <span className="numeral shrink-0 font-mono text-[10px] text-muted-foreground">
                      {new Date(aviso.ts).toLocaleTimeString("es-CO", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
