import type { Metadata } from "next";
import { Role } from "@/generated/prisma/enums";
import { getCartaAdmin, getTarifas } from "@/features/carta/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/dal";
import { formatCop, formatRateBp } from "@/lib/money";
import {
  AccionesProducto,
  ArchivarCategoria,
  NuevaCategoria,
  NuevaPresentacion,
  NuevoProducto,
} from "./formularios";

export const metadata: Metadata = { title: "Carta" };
export const dynamic = "force-dynamic";

export default async function CartaPage() {
  // Verifica por su cuenta: el layout no es frontera.
  const ctx = await requireRole(Role.ADMINISTRADOR);

  const [categorias, tarifas] = await Promise.all([
    getCartaAdmin(ctx.business.id),
    getTarifas(ctx.business.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Carta</h1>
        <p className="text-muted-foreground text-sm">
          Lo que se archiva sale de la carta pero sigue en los pedidos viejos: un tiquete
          reimpreso no cambia.
        </p>
      </div>

      <Card>
        <CardContent>
          <NuevaCategoria />
        </CardContent>
      </Card>

      {categorias.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Todavía no hay categorías. Creá la primera —Cervezas, Picadas— y cargale productos.
        </p>
      )}

      {categorias.map((categoria) => (
        <Card key={categoria.id}>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">
                {categoria.name}
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  {categoria.products.length}{" "}
                  {categoria.products.length === 1 ? "producto" : "productos"}
                </span>
              </h2>
              <ArchivarCategoria id={categoria.id} name={categoria.name} />
            </div>

            {categoria.products.length > 0 && (
              <ul className="divide-border divide-y">
                {categoria.products.map((producto) => (
                  <li key={producto.id} className="space-y-1.5 py-3 first:pt-0">
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
                  </li>
                ))}
              </ul>
            )}

            <NuevoProducto categoryId={categoria.id} tarifas={tarifas} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
