"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { agregarItem } from "@/features/pedidos/actions";
import { ImagenProducto } from "@/features/pedidos/components/imagen-producto";
import {
  SelectorModificadores,
  tieneModificadores,
  type ProductoConModificadores,
} from "@/features/carta/components/selector-modificadores";
import { Input } from "@/components/ui/input";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * La carta, para tocar rápido.
 *
 * Es la misma para una mesa de restaurante y para un mostrador de venta
 * rápida: lo que cambia es quién la mira y qué tan apurado está, no cómo se
 * agrega un producto.
 *
 * **Un toque, un renglón sigue siendo la regla.** Una gaseosa no tiene nada que
 * elegir y entra directo, sin confirmar nada: pedir dos toques para todo por si
 * acaso habría hecho más lento el caso más común. El modal aparece solo cuando
 * el producto tiene modificadores cargados y de verdad hay una decisión que
 * tomar —qué proteína lleva el menú del día, qué término la carne—, y entonces
 * escribe la elección en el mismo formulario de siempre.
 */

export type ProductoDeCarta = ProductoConModificadores & {
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
  const [estado, accion, isPending] = useActionState(agregarItem, ESTADO_INICIAL);
  const [modalAbierto, setModalAbierto] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const conModificadores = tieneModificadores(producto);

  // Las opciones elegidas se escriben como campos ocultos repetidos y se envía
  // el mismo formulario de siempre. Así el camino de guardado es uno solo: el
  // producto simple y el producto con proteína terminan en la misma acción, con
  // la misma validación y el mismo manejo de error.
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");

  return (
    <li className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card transition-all duration-300 hover:border-brand/40 hover:shadow-xl hover:shadow-brand/10 hover:-translate-y-1 active:scale-[0.98]">
      <form action={accion} ref={formRef} className="contents">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="productId" value={producto.id} />
        <input type="hidden" name="quantity" value={cantidad} />
        {nota && <input type="hidden" name="notes" value={nota} />}
        {elegidas.map((opcionId) => (
          <input key={opcionId} type="hidden" name="modifierOptionIds" value={opcionId} />
        ))}

        <div className="overflow-hidden">
          <ImagenProducto
            nombre={producto.name}
            imageUrl={producto.imageUrl}
            className="aspect-square w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        </div>
        <Boton
          nombre={producto.name}
          precio={producto.priceCop}
          disponible={producto.isAvailable}
          isPending={isPending}
          conModificadores={conModificadores}
          onElegir={
            conModificadores
              ? () => {
                  setModalAbierto(true);
                }
              : undefined
          }
        />
      </form>

      {conModificadores && (
        <SelectorModificadores
          producto={producto}
          abierto={modalAbierto}
          onCerrar={() => setModalAbierto(false)}
          onConfirmar={({ opcionIds, quantity, notes }) => {
            setElegidas(opcionIds);
            setCantidad(quantity);
            setNota(notes);
            setModalAbierto(false);
            // El submit va después de que React pinte los campos ocultos: sin el
            // salto de turno el formulario se manda sin la proteína elegida.
            requestAnimationFrame(() => formRef.current?.requestSubmit());
          }}
        />
      )}

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
  isPending,
  conModificadores,
  onElegir,
}: {
  nombre: string;
  precio: number;
  disponible: boolean;
  isPending?: boolean;
  conModificadores?: boolean;
  onElegir?: () => void;
}) {
  const { pending } = useFormStatus();
  const cargando = pending || isPending;

  return (
    <button
      // Con modificadores el botón abre el modal en vez de enviar; el envío lo
      // dispara el modal al confirmar.
      type={conModificadores ? "button" : "submit"}
      onClick={onElegir}
      disabled={cargando || !disponible}
      className={cn(
        "flex w-full flex-col gap-0.5 p-2.5 text-left transition-colors duration-200",
        "group-hover:bg-accent/70 focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <span className="text-sm leading-tight font-semibold tracking-tight transition-colors duration-200 group-hover:text-brand">
        {nombre}
      </span>
      <span className="numeral text-muted-foreground text-xs font-medium transition-colors duration-200 group-hover:text-foreground">
        {disponible ? formatCop(precio) : "Agotado"}
        {disponible && conModificadores && (
          <span className="text-brand ml-1 font-semibold">· a elegir</span>
        )}
      </span>
      <span className="sr-only">
        {cargando ? "Agregando" : conModificadores ? "Elegir opciones" : "Agregar al pedido"}
      </span>
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
