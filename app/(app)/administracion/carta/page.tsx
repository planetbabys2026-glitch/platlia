import type { Metadata } from "next";
import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import { getCartaAdmin, getTarifas } from "@/features/carta/queries";
import { getGruposParaAsignar } from "@/features/modificadores/queries";
import { notFound } from "next/navigation";
import { getSettings } from "@/features/negocio/queries";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/dal";
import { tienePermisoSeccion } from "@/lib/auth/permisos-roles";
import { cn } from "@/lib/utils";
import {
  ArchivarCategoria,
  FilaProducto,
  NuevaCategoria,
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
  const ctx = await requireRole(Role.ADMINISTRADOR, Role.CAJERO, Role.MESERO, Role.COCINA);
  const settings = await getSettings(ctx.business.id);
  if (!tienePermisoSeccion(ctx.role, "carta", settings.rolePermissions)) {
    notFound();
  }
  const { categoria: categoriaIdParam } = await searchParams;

  const [categorias, tarifas, grupos] = await Promise.all([
    getCartaAdmin(ctx.business.id),
    getTarifas(ctx.business.id),
    getGruposParaAsignar(ctx.business.id),
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
                      "flex min-h-11 tableta:min-h-9 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
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
                    <FilaProducto
                      key={producto.id}
                      producto={producto}
                      categoryId={activa.id}
                      tarifas={tarifas}
                      estaciones={estaciones}
                      grupos={grupos}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Esta categoría todavía no tiene productos.
                </p>
              )}
            </CardContent>
          </Card>

          <NuevoProducto
            categoryId={activa.id}
            tarifas={tarifas}
            estaciones={estaciones}
            grupos={grupos}
          />
        </section>
      </div>
    </div>
  );
}

function Encabezado() {
  return (
    <div className="space-y-1">
      <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-[clamp(1.875rem,3vw,2.5rem)]">Carta</h1>
      <p className="text-muted-foreground text-sm">
        Lo que se archiva sale de la carta pero sigue en los pedidos viejos: un tiquete
        reimpreso no cambia.
      </p>
      <Link
        href="/administracion/carta/modificadores"
        className="text-brand inline-flex min-h-11 tableta:min-h-0 items-center pt-1 text-sm font-medium hover:underline"
      >
        Modificadores (proteína, término, adiciones) ↗
      </Link>
    </div>
  );
}
