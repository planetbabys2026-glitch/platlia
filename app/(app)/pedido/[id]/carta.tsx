"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { agregarItem } from "@/features/pedidos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * La carta, para tocar.
 *
 * Cada presentación es su propio botón —"Cerveza (Jarra)" en vez de elegir
 * producto y después tamaño— porque el mesero está parado al lado de la mesa: un
 * toque tiene que ser un renglón.
 */

export type ProductoDeCarta = {
  id: string;
  name: string;
  priceCop: number;
  isAvailable: boolean;
  variants: { id: string; name: string; priceCop: number }[];
};

export type CategoriaDeCarta = {
  id: string;
  name: string;
  products: ProductoDeCarta[];
};

function Boton({
  nombre,
  precio,
  disponible,
}: {
  nombre: string;
  precio: number;
  disponible: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !disponible}
      className={cn(
        "border-border bg-card flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
        "hover:bg-accent focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <span className="text-sm leading-tight font-medium">{nombre}</span>
      <span className="numeral text-muted-foreground text-xs">
        {disponible ? formatCop(precio) : "agotado"}
      </span>
      <span className="sr-only">{pending ? "Agregando" : "Agregar al pedido"}</span>
    </button>
  );
}

export function Carta({
  orderId,
  categorias,
  editable,
}: {
  orderId: string;
  categorias: CategoriaDeCarta[];
  editable: boolean;
}) {
  const [estado, accion] = useActionState(agregarItem, ESTADO_INICIAL);

  if (!editable) {
    return (
      <p className="text-muted-foreground text-sm">
        El pedido está cerrado: no se le pueden agregar productos.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      {categorias.map((categoria) => (
        <section key={categoria.id} className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase">
            {categoria.name}
          </h3>
          <ul className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {categoria.products.flatMap((producto) =>
              producto.variants.length > 0
                ? producto.variants.map((variante) => (
                    <li key={variante.id}>
                      <form action={accion}>
                        <input type="hidden" name="orderId" value={orderId} />
                        <input type="hidden" name="productId" value={producto.id} />
                        <input type="hidden" name="variantId" value={variante.id} />
                        <Boton
                          nombre={`${producto.name} · ${variante.name}`}
                          precio={variante.priceCop}
                          disponible={producto.isAvailable}
                        />
                      </form>
                    </li>
                  ))
                : [
                    <li key={producto.id}>
                      <form action={accion}>
                        <input type="hidden" name="orderId" value={orderId} />
                        <input type="hidden" name="productId" value={producto.id} />
                        <Boton
                          nombre={producto.name}
                          precio={producto.priceCop}
                          disponible={producto.isAvailable}
                        />
                      </form>
                    </li>,
                  ],
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
