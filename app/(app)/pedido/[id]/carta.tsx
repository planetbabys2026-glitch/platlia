"use client";

import { useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { agregarItem } from "@/features/pedidos/actions";
import { SeccionPlegable } from "@/components/marca/seccion-plegable";
import { ImagenProducto } from "@/features/pedidos/components/imagen-producto";
import {
  SelectorModificadores,
  tieneModificadores,
  type ProductoConModificadores,
} from "@/features/carta/components/selector-modificadores";
import { Input } from "@/components/ui/input";
import { formatCop } from "@/lib/money";
import { calcularStockDisponibleProducto } from "@/lib/inventory/stock";
import { cn } from "@/lib/utils";
import { useCuenta } from "./cuenta-en-vivo";

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
  taxRate: { rateBp: number };
};

/** Umbral de "quedan pocos", el mismo que usa el POS. */
const POCAS_PORCIONES = 5;

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

function TarjetaProducto({
  orderId,
  producto,
  inventoryEnabled = true,
  permitirVentaSinStock = false,
}: {
  orderId: string;
  producto: ProductoDeCarta;
  inventoryEnabled?: boolean;
  permitirVentaSinStock?: boolean;
}) {
  const cuenta = useCuenta();
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const conModificadores = tieneModificadores(producto);

  // Lo que el POS ya hacía y acá no: la carta venía recibiendo `stockQty`,
  // `hasRecipe` y `recipeItems` desde `getCarta` y solo miraba `isAvailable`. El
  // mesero veía la tarjeta tocable, la tocaba, y el error de stock le llegaba
  // parado en la mesa. `null` significa "este producto no se mide", no cero.
  const disponibles = calcularStockDisponibleProducto(producto, inventoryEnabled);
  const sinStock = disponibles !== null && disponibles <= 0;
  const pocas = disponibles !== null && disponibles > 0 && disponibles <= POCAS_PORCIONES;

  // Las opciones elegidas se escriben como campos ocultos repetidos y se envía
  // el mismo formulario de siempre. Así el camino de guardado es uno solo: el
  // producto simple y el producto con proteína terminan en la misma acción, con
  // la misma validación y el mismo manejo de error.
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");

  /** Nombre y precio de cada opción elegida, para el renglón que se anticipa. */
  const detalleDeElegidas = () =>
    (producto.modifierGroups ?? [])
      .flatMap((a) => a.group.options)
      .filter((o) => elegidas.includes(o.id))
      .map((o) => ({ nombre: o.name, precioCop: o.priceDeltaCop }));

  /**
   * Se llama la acción directo en vez de pasar por `useActionState`, y se la
   * espera. Es lo que mantiene abierta la transición del formulario mientras el
   * servidor trabaja, y por lo tanto lo que mantiene visible el renglón
   * optimista: con `useActionState` la transición se cerraba antes y el renglón
   * anticipado desaparecía justo en el hueco que se quería tapar.
   */
  const enviar = async (formData: FormData) => {
    setError(null);
    cuenta?.agregarOptimista({
      nombre: producto.name,
      precioUnitarioCop: producto.priceCop,
      taxRateBp: producto.taxRate.rateBp,
      cantidad,
      modificadores: detalleDeElegidas(),
    });

    try {
      const resultado = await agregarItem(undefined, formData);
      if (!resultado.ok) setError(resultado.error ?? "No se pudo agregar.");
    } catch {
      // Si la acción no llega a contestar —red caída, servidor reiniciándose—
      // el renglón optimista se desvanece solo y hay que decir por qué. Sin este
      // catch el error sube al límite de error y se lleva la pantalla entera por
      // una cerveza que no entró.
      setError("No se pudo agregar. Tocá de nuevo.");
    }
  };

  return (
    <li className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card transition-all duration-300 hover:border-brand/40 hover:shadow-xl hover:shadow-brand/10 hover:-translate-y-1 active:scale-[0.98]">
      <form action={enviar} ref={formRef} className="contents">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="productId" value={producto.id} />
        <input type="hidden" name="quantity" value={cantidad} />
        {nota && <input type="hidden" name="notes" value={nota} />}
        {elegidas.map((opcionId) => (
          <input key={opcionId} type="hidden" name="modifierOptionIds" value={opcionId} />
        ))}

        {/* Solo si hay foto de verdad. El respaldo con la inicial funciona como
            avatar chico, pero acá ocupaba un cuadrado del ancho de la tarjeta: en
            una carta sin fotos daban tres bloques enormes con una "C" cada uno, y
            el nombre y el precio —lo único que se necesita para tocar— quedaban
            relegados a un pie de 40px. Sin foto, la tarjeta es el nombre. */}
        {producto.imageUrl && (
          <div className="overflow-hidden">
            <ImagenProducto
              nombre={producto.name}
              imageUrl={producto.imageUrl}
              className="aspect-square w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          </div>
        )}
        <Boton
          nombre={producto.name}
          precio={producto.priceCop}
          disponible={producto.isAvailable && (!sinStock || permitirVentaSinStock)}
          agotadoPorStock={sinStock}
          disponibles={disponibles}
          pocas={pocas}
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
          inventoryEnabled={inventoryEnabled}
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

      {error && <p className="text-destructive px-2 pb-2 text-xs">{error}</p>}
    </li>
  );
}

function Boton({
  nombre,
  precio,
  disponible,
  agotadoPorStock,
  disponibles,
  pocas,
  conModificadores,
  onElegir,
}: {
  nombre: string;
  precio: number;
  disponible: boolean;
  /** Se acabó según el inventario, distinto de la marca manual de "agotado". */
  agotadoPorStock?: boolean;
  /** Porciones o unidades que alcanzan hoy. `null` = el producto no se mide. */
  disponibles?: number | null;
  pocas?: boolean;
  conModificadores?: boolean;
  onElegir?: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      // Con modificadores el botón abre el modal en vez de enviar; el envío lo
      // dispara el modal al confirmar.
      type={conModificadores ? "button" : "submit"}
      onClick={onElegir}
      // A propósito NO se deshabilita mientras el envío está en curso. Antes sí,
      // y era peor de lo que parece: el bloqueo duraba lo que tardaba la acción,
      // pero el renglón recién aparecía cuando volvía la pantalla entera, así que
      // el botón se soltaba antes de que se viera nada. Ahora el renglón entra al
      // instante y dos toques seguidos son dos cervezas, que es lo que se quiso
      // pedir.
      disabled={!disponible}
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
        {disponible || agotadoPorStock ? formatCop(precio) : "Agotado"}
        {disponible && conModificadores && (
          <span className="text-brand ml-1 font-semibold">· a elegir</span>
        )}
      </span>
      {typeof disponibles === "number" && (
        <span
          className={cn(
            "text-rotulo mt-0.5 w-fit rounded-md border px-1.5 py-0.5 font-bold",
            agotadoPorStock
              ? "bg-destructive/10 text-destructive-soft border-destructive/30"
              : pocas
                ? "bg-warning/10 text-warning-soft border-warning/30"
                : "bg-success/10 text-success-soft border-success/30",
          )}
        >
          {agotadoPorStock ? "SIN STOCK" : `${disponibles} disp.`}
        </span>
      )}
      <span className="sr-only">
        {pending ? "Agregando" : conModificadores ? "Elegir opciones" : "Agregar al pedido"}
      </span>
    </button>
  );
}

export function Carta({
  orderId,
  categorias,
  editable,
  inventoryEnabled = true,
  permitirVentaSinStock = false,
}: {
  orderId: string;
  categorias: CategoriaDeCarta[];
  editable: boolean;
  inventoryEnabled?: boolean;
  permitirVentaSinStock?: boolean;
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
              <TarjetaProducto
                key={producto.id}
                orderId={orderId}
                producto={producto}
                inventoryEnabled={inventoryEnabled}
                permitirVentaSinStock={permitirVentaSinStock}
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
          {categoriasAMostrar.map((categoria) => {
            const productos = (
              // Auto-fill, igual que el salón y cocina: la tarjeta mide lo que
              // tiene que medir en vez de partirse en dos columnas fijas.
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
                {categoria.products.map((producto) => (
                  <TarjetaProducto
                    key={producto.id}
                    orderId={orderId}
                    producto={producto}
                    inventoryEnabled={inventoryEnabled}
                    permitirVentaSinStock={permitirVentaSinStock}
                  />
                ))}
              </ul>
            );

            // Con una categoría filtrada no hay nada que plegar: ya es la única.
            if (categoriaActiva !== null) {
              return (
                <section key={categoria.id} className="space-y-2">
                  {productos}
                </section>
              );
            }

            return (
              <SeccionPlegable
                key={categoria.id}
                titulo={categoria.name}
                cuenta={categoria.products.length}
              >
                {productos}
              </SeccionPlegable>
            );
          })}
        </div>
      )}
    </div>
  );
}
