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
 * agrega un producto. Un producto sin presentaciones se agrega de un toque; uno
 * con presentaciones se expande ahí mismo para elegir cuál, sin tapar el resto
 * de la carta con un modal.
 */

export type ProductoDeCarta = {
  id: string;
  name: string;
  priceCop: number;
  isAvailable: boolean;
  imageUrl: string | null;
  variants: { id: string; name: string; priceCop: number }[];
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

function Enviar({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cn(
        "w-full rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
        "bg-secondary hover:bg-primary hover:text-primary-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}

function TarjetaProducto({
  orderId,
  producto,
  expandido,
  onTocar,
}: {
  orderId: string;
  producto: ProductoDeCarta;
  expandido: boolean;
  onTocar: () => void;
}) {
  const [estado, accion] = useActionState(agregarItem, ESTADO_INICIAL);
  const tieneVariantes = producto.variants.length > 0;

  return (
    <li
      className={cn(
        "border-border bg-card overflow-hidden rounded-xl border transition-shadow",
        expandido && "ring-primary/40 ring-2",
      )}
    >
      {tieneVariantes ? (
        <button
          type="button"
          onClick={onTocar}
          disabled={!producto.isAvailable}
          className="flex w-full flex-col text-left disabled:pointer-events-none disabled:opacity-40"
        >
          <ImagenProducto
            nombre={producto.name}
            imageUrl={producto.imageUrl}
            className="aspect-square w-full object-cover"
          />
          <span className="space-y-0.5 p-2">
            <span className="block text-sm leading-tight font-medium">{producto.name}</span>
            <span className="numeral text-muted-foreground block text-xs">
              {producto.isAvailable
                ? `Desde ${formatCop(Math.min(...producto.variants.map((v) => v.priceCop)))}`
                : "Agotado"}
            </span>
          </span>
        </button>
      ) : (
        <form action={accion} className="contents">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="productId" value={producto.id} />
          <ImagenProducto
            nombre={producto.name}
            imageUrl={producto.imageUrl}
            className="aspect-square w-full object-cover"
          />
          <button
            type="submit"
            disabled={!producto.isAvailable}
            className="flex w-full flex-col gap-0.5 p-2 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
          >
            <span className="text-sm leading-tight font-medium">{producto.name}</span>
            <span className="numeral text-muted-foreground text-xs">
              {producto.isAvailable ? formatCop(producto.priceCop) : "Agotado"}
            </span>
          </button>
        </form>
      )}

      {expandido && tieneVariantes && (
        <div className="space-y-1 border-t border-border p-2">
          {producto.variants.map((variante) => (
            <form key={variante.id} action={accion}>
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="productId" value={producto.id} />
              <input type="hidden" name="variantId" value={variante.id} />
              <Enviar>
                {variante.name} · <span className="numeral">{formatCop(variante.priceCop)}</span>
              </Enviar>
            </form>
          ))}
        </div>
      )}

      {!estado.ok && estado.error && (
        <p className="text-destructive px-2 pb-2 text-xs">{estado.error}</p>
      )}
    </li>
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
  const [expandido, setExpandido] = useState<string | null>(null);

  const buscando = busqueda.trim().length > 0;

  const resultados = useMemo(() => {
    if (!buscando) return null;
    const q = normalizar(busqueda);
    return categorias
      .flatMap((c) => c.products)
      .filter(
        (p) =>
          normalizar(p.name).includes(q) ||
          p.variants.some((v) => normalizar(v.name).includes(q)),
      );
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
              <TarjetaProducto
                key={producto.id}
                orderId={orderId}
                producto={producto}
                expandido={expandido === producto.id}
                onTocar={() => setExpandido(expandido === producto.id ? null : producto.id)}
              />
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
                  <TarjetaProducto
                    key={producto.id}
                    orderId={orderId}
                    producto={producto}
                    expandido={expandido === producto.id}
                    onTocar={() => setExpandido(expandido === producto.id ? null : producto.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
