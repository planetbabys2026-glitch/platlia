"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { agregarItem } from "@/features/pedidos/actions";
import { ImagenProducto } from "@/features/pedidos/components/imagen-producto";
import { Input } from "@/components/ui/input";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * La carta, para tocar rápido.
 *
 * Es la misma para una mesa de restaurante y para un mostrador de venta
 * rápida: lo que cambia es quién la mira y qué tan apurado está, no cómo se
 * agrega un producto. Un toque, un renglón: no hay presentaciones que elegir
 * primero —"Cerveza (Botella)" y "Cerveza (Litro)" son dos productos, no uno
 * con una bifurcación adentro—, así que no hace falta ni un acordeón ni un
 * modal en el medio.
 */

export type ProductoDeCarta = {
  id: string;
  name: string;
  priceCop: number;
  isAvailable: boolean;
  imageUrl: string | null;
};

export type CategoriaDeCarta = {
  id: string;
  name: string;
  products: ProductoDeCarta[];
};

/** Sin tildes ni mayúsculas: así uno escribe "cafe" y encuentra "Café". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function TarjetaProducto({ orderId, producto }: { orderId: string; producto: ProductoDeCarta }) {
  const [estado, accion] = useActionState(agregarItem, ESTADO_INICIAL);

  return (
    <li className="border-border bg-card overflow-hidden rounded-xl border">
      <form action={accion} className="contents">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="productId" value={producto.id} />
        <ImagenProducto
          nombre={producto.name}
          imageUrl={producto.imageUrl}
          className="aspect-square w-full object-cover"
        />
        <Boton nombre={producto.name} precio={producto.priceCop} disponible={producto.isAvailable} />
      </form>

      {!estado.ok && estado.error && (
        <p className="text-destructive px-2 pb-2 text-xs">{estado.error}</p>
      )}
    </li>
  );
}

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
        "flex w-full flex-col gap-0.5 p-2 text-left transition-colors",
        "hover:bg-accent focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <span className="text-sm leading-tight font-medium">{nombre}</span>
      <span className="numeral text-muted-foreground text-xs">
        {disponible ? formatCop(precio) : "Agotado"}
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
  const [busqueda, setBusqueda] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);

  const buscando = busqueda.trim().length > 0;

  const resultados = useMemo(() => {
    if (!buscando) return null;
    const q = normalizar(busqueda);
    return categorias.flatMap((c) => c.products).filter((p) => normalizar(p.name).includes(q));
  }, [busqueda, buscando, categorias]);

  if (!editable) {
    return (
      <p className="text-muted-foreground text-sm">
        El pedido está cerrado: no se le pueden agregar productos.
      </p>
    );
  }

  const categoriasAMostrar = categoriaActiva
    ? categorias.filter((c) => c.id === categoriaActiva)
    : categorias;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          value={busqueda}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBusqueda(e.target.value)}
          type="search"
          placeholder="Buscar en la carta…"
          aria-label="Buscar producto"
        />

        {!buscando && categorias.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategoriaActiva(null)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                categoriaActiva === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary hover:bg-accent",
              )}
            >
              Todo
            </button>
            {categorias.map((categoria) => (
              <button
                key={categoria.id}
                type="button"
                onClick={() => setCategoriaActiva(categoria.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  categoriaActiva === categoria.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary hover:bg-accent",
                )}
              >
                {categoria.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {buscando ? (
        resultados && resultados.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {resultados.map((producto) => (
              <TarjetaProducto key={producto.id} orderId={orderId} producto={producto} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            Nada coincide con &quot;{busqueda}&quot;.
          </p>
        )
      ) : (
        <div className="space-y-6">
          {categoriasAMostrar.map((categoria) => (
            <section key={categoria.id} className="space-y-2">
              {categoriaActiva === null && (
                <h3 className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase">
                  {categoria.name}
                </h3>
              )}
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {categoria.products.map((producto) => (
                  <TarjetaProducto key={producto.id} orderId={orderId} producto={producto} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
