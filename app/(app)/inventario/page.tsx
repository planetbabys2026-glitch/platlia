import type { Metadata } from "next";
import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import { getSettings } from "@/features/negocio/queries";
import {
  getCategories,
  getFinishedProducts,
  getInventorySummary,
  getProductRecipes,
  getPurchaseInvoices,
  getSuppliers,
} from "@/features/inventario/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/dal";
import { VistaInventario } from "./vista-inventario";

export const metadata: Metadata = { title: "Inventario" };
export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const ctx = await requireRole(Role.ADMINISTRADOR, Role.CAJERO);
  const settings = await getSettings(ctx.business.id);

  if (!settings.inventoryEnabled) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="text-muted-foreground text-sm">
            Gestión de stock de insumos, entradas por facturas de compra y recetas.
          </p>
        </div>

        <Card className="py-12 text-center border-dashed">
          <CardContent className="space-y-4 max-w-md mx-auto">
            <h2 className="font-bold text-lg text-foreground">El Inventario no está activado</h2>
            <p className="text-muted-foreground text-sm">
              Para empezar a cargar stock inicial, registrar facturas de compra de proveedores y controlar insumos, activá el módulo de inventario desde la configuración del negocio.
            </p>
            <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
              <Link href="/administracion/configuracion">
                Ir a Configuración del Negocio ↗
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [summary, suppliers, invoices, recipeData, finishedProducts, categories] = await Promise.all([
    getInventorySummary(ctx.business.id),
    getSuppliers(ctx.business.id),
    getPurchaseInvoices(ctx.business.id),
    getProductRecipes(ctx.business.id),
    getFinishedProducts(ctx.business.id),
    getCategories(ctx.business.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
        <p className="text-muted-foreground text-sm">
          Control de stock de insumos, facturas de compra de proveedores, productos terminados y recetas por producto.
        </p>
      </div>

      <VistaInventario
        summary={summary}
        suppliers={suppliers}
        invoices={invoices}
        recipeData={recipeData}
        finishedProducts={finishedProducts}
        categories={categories}
        recipesEnabled={settings.recipesEnabled}
      />
    </div>
  );
}
