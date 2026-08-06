import type { Metadata } from "next";
import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import { getCartaAdmin, getTarifas } from "@/features/carta/queries";
import { ImagenProducto } from "@/features/pedidos/components/imagen-producto";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/dal";
import { formatCop, formatRateBp } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  AccionesProducto,
  ArchivarCategoria,
  NuevaCategoria,
  NuevaPresentacion,
  NuevoProducto,
  RenombrarCategoria,
} from "./formularios";

export const metadata: Metadata = { title: "Carta" };
export const dynamic = "force-dynamic";

// En Next 15 searchParams es una Promise. La categoría activa viaja en la URL
// —no en estado de cliente— para que un enlace a "Carta" siempre abra algo
// bookmarkeable y para no necesitar JS solo para cambiar de categoría.
export default async function CartaPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  // Verifica por su cuenta: el layout no es frontera.
  const ctx = await requireRole(Role.ADMINISTRADOR);
  const { categoria: categoriaIdParam } = await searchParams;

  const [categorias, tarifas] = await Promise.all([
    getCartaAdmin(ctx.business.id),
    getTarifas(ctx.business.id),
  ]);

  if (categorias.length === 0) {
    return (
      <div className="space-y-6">
        <Encabezado />
        <div className="border-border rounded-xl border border-dashed px-6 py-16 text-center">
          <p className="text-muted-foreground mx-auto mb-4 max-w-sm text-sm">
            Todavía no hay categorías. Creá la primera —Cervezas, Picadas— y cargale productos.
          </p>
          <NuevaCategoria destacada />
        </div>
      </div>
    );
  }

  // Estaciones que este negocio ya usa, para sugerirlas en vez de que cada
  // producto invente una nueva ("Cocina" / "cocina" / "Kitchen" del mismo bar).
  const estaciones = [
    ...new Set(
      categorias
        .flatMap((c) => c.products.map((p) => p.kitchenStation))
        .filter((s): s is string => Boolean(s)),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const activa = categorias.find((c) => c.id === categoriaIdParam) ?? categorias[0];

  return (
    <div className="space-y-6">
      <Encabezado />

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Categorías" className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <NuevaCategoria />

          <ul className="space-y-0.5">
            {categorias.map((categoria) => {
              const seleccionada = categoria.id === activa.id;
              return (
                <li key={categoria.id}>
                  <Link
                    href={`/administracion/carta?categoria=${categoria.id}`}
                    aria-current={seleccionada ? "true" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      seleccionada
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent",
                    )}
                  >
                    <span className="truncate">{categoria.name}</span>
                    <span
                      className={cn(
                        "numeral text-xs",
                        seleccionada ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {categoria.products.length}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <section aria-label={`Productos de ${activa.name}`} className="min-w-0 space-y-4">
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <h2 className="font-medium">{activa.name}</h2>
                  <RenombrarCategoria id={activa.id} name={activa.name} />
                </div>
                <ArchivarCategoria id={activa.id} name={activa.name} />
              </div>

              {activa.products.length > 0 ? (
                <ul className="divide-border divide-y">
                  {activa.products.map((producto) => (
                    <li key={producto.id} className="flex gap-3 py-3 first:pt-0">
                      <ImagenProducto
                        nombre={producto.name}
                        imageUrl={producto.imageUrl}
                        className="size-14 shrink-0 rounded-lg object-cover"
                      />

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-medium">{producto.name}</span>
                            {!producto.isAvailable && <Badge variant="secondary">Agotado</Badge>}
                          </span>
                          <span className="numeral text-sm">{formatCop(producto.priceCop)}</span>
                        </div>

                        <p className="text-muted-foreground text-xs">
                          {producto.taxRate.name} {formatRateBp(producto.taxRate.rateBp)}
                          {producto.kitchenStation && ` · ${producto.kitchenStation}`}
                          {producto.sku && ` · ${producto.sku}`}
                        </p>

                        {producto.variants.length > 0 && (
                          <ul className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                            {producto.variants.map((variante) => (
                              <li key={variante.id}>
                                {variante.name}{" "}
                                <span className="numeral">{formatCop(variante.priceCop)}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <NuevaPresentacion productId={producto.id} />
                          <AccionesProducto
                            productId={producto.id}
                            isAvailable={producto.isAvailable}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Esta categoría todavía no tiene productos.
                </p>
              )}
            </CardContent>
          </Card>

          <NuevoProducto categoryId={activa.id} tarifas={tarifas} estaciones={estaciones} />
        </section>
      </div>
    </div>
  );
}

function Encabezado() {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">Carta</h1>
      <p className="text-muted-foreground text-sm">
        Lo que se archiva sale de la carta pero sigue en los pedidos viejos: un tiquete
        reimpreso no cambia.
      </p>
    </div>
  );
}
