"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatCop } from "@/lib/money";
import { useCuentaObligatoria } from "./cuenta-en-vivo";

/**
 * La cuenta, en celular.
 *
 * En pantalla grande la cuenta es la columna de la derecha y se ve siempre. En un
 * celular esa columna cae debajo de la carta entera: para ver el total había que
 * pasar de largo dieciocho productos, y para tocar "Confirmar pedido" también.
 *
 * Acá se convierte en una barra fija abajo —con lo único que importa mientras se
 * canta el pedido, cuántos renglones van y cuánto suman— que abre la cuenta
 * completa en una hoja. Es el mismo contenido: llega como `children` desde el
 * Server Component, así que no hay una segunda versión que mantener.
 *
 * La hoja se cierra sola al enviar cualquier formulario de adentro: agregar un
 * producto o pedir la cuenta re-renderiza la página, y dejarla abierta encima
 * taparía lo que acaba de pasar.
 */
export function CuentaMovil({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  // El conteo y el total salen de la cuenta en vivo y no de props del servidor:
  // en celular la barra es lo único que se ve mientras se canta el pedido, así
  // que tiene que moverse con el toque, no con la vuelta del servidor.
  const { renglones: lista, totales } = useCuentaObligatoria();
  const renglones = lista.length;
  const totalCop = totales.totalCop;

  return (
    <Sheet open={abierta} onOpenChange={setAbierta}>
      {/* Deja aire al final de la página para que la barra no tape el último
          producto de la carta. En teléfono hay DOS barras ancladas abajo —esta y
          la de navegación del shell, de 4rem— así que el colchón las cuenta a las
          dos: antes medía una sola y la de navegación quedaba encima de la cuenta. */}
      <div aria-hidden className="h-36 sm:h-20 lg:hidden" />

      <div className="border-border/80 bg-card/95 fixed inset-x-0 bottom-16 z-30 border-t p-3 backdrop-blur sm:bottom-0 lg:hidden">
        <SheetTrigger asChild>
          <button
            type="button"
            className="bg-brand text-brand-foreground flex h-12 w-full items-center justify-between rounded-xl px-4 text-sm font-bold"
          >
            <span>
              Ver cuenta
              {renglones > 0 && (
                <span className="ml-2 font-normal opacity-80">
                  {renglones} {renglones === 1 ? "producto" : "productos"}
                </span>
              )}
            </span>
            <span className="numeral text-base">{formatCop(totalCop)}</span>
          </button>
        </SheetTrigger>
      </div>

      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{titulo}</SheetTitle>
        </SheetHeader>
        <div
          className="space-y-4 px-4 pb-6"
          onSubmitCapture={() => setAbierta(false)}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
