import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings } from "@/features/negocio/queries";
import { evaluarEstadoNegocio } from "@/features/negocio/horarios";
import { parseExtraSettings } from "@/features/negocio/extra-settings";
// eslint-disable-next-line no-restricted-imports -- Ruta pública para resolver el negocio por su slug público
import { rootDb } from "@/lib/db/root";
import { tenantDb } from "@/lib/db/tenant";
import { ClienteMenuQr } from "./cliente-menu-qr";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const business = await rootDb.business.findFirst({
    where: { slug, status: "ACTIVO", deletedAt: null },
    select: { name: true },
  });

  if (!business) return { title: "Menú no encontrado" };
  return {
    title: `Menú Digital · ${business.name}`,
    description: `Menú digital interactivo de ${business.name}. Hacé tu pedido directamente desde tu celular.`,
  };
}

export default async function MenuQrPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mesa?: string; tableId?: string; tipo?: string }>;
}) {
  // El `?mesa=` del QR ya no se lee: era solo una etiqueta y cualquiera podía
  // escribir la que quisiera. El nombre sale de la mesa que resuelve `tableId`.
  const [{ slug }, { tableId, tipo }] = await Promise.all([params, searchParams]);

  // 1. Buscar negocio público por slug
  const business = await rootDb.business.findFirst({
    where: { slug, status: "ACTIVO", deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      address: true,
      phone: true,
    },
  });

  if (!business) return notFound();

  // 2. Cargar configuración del negocio
  const settings = await getSettings(business.id);

  if (!settings.qrMenuEnabled) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <div className="size-16 mx-auto rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-2xl font-bold">
            📱
          </div>
          <h1 className="text-xl font-bold">{business.name}</h1>
          <p className="text-xs text-slate-400">
            El menú digital QR está desactivado temporalmente en este establecimiento.
          </p>
        </div>
      </div>
    );
  }

  // 3. Cargar categorías, productos disponibles e imagen placeholder por defecto
  const db = tenantDb(business.id);

  const [categorias, productos, placeholder] = await Promise.all([
    db.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.product.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        shortDescription: true,
        description: true,
        priceCop: true,
        imageUrl: true,
        isAvailable: true,
        categoryId: true,
        hasRecipe: true,
        recipeItems: {
          select: {
            quantityRequired: true,
            inventoryItem: {
              select: { id: true, name: true, unit: true, stockCurrent: true },
            },
          },
        },
        modifierGroups: {
          where: { group: { deletedAt: null, active: true } },
          orderBy: { sortOrder: "asc" },
          select: {
            required: true,
            group: {
              select: {
                id: true,
                name: true,
                helpText: true,
                minSelect: true,
                maxSelect: true,
                options: {
                  where: { deletedAt: null, active: true },
                  orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                  select: {
                    id: true,
                    name: true,
                    priceDeltaCop: true,
                    isDefault: true,
                    supplies: {
                      select: {
                        quantityRequired: true,
                        inventoryItem: {
                          select: { id: true, name: true, unit: true, stockCurrent: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    rootDb.placeholderImage.findFirst({
      where: { isDefault: true },
      select: { imageUrl: true },
    }),
  ]);

  /**
   * La mesa se resuelve acá, no se cree la de la URL.
   *
   * El QR trae `?mesa=<nombre>&tableId=<id>`, y hasta ahora el modo "pedido de
   * mesa" se decidía por la ETIQUETA: `esMesa = Boolean(mesaParam)`. Con eso,
   * `/m/bar-demo?mesa=cualquier+cosa` abría el flujo de mesa sin mesa, y el
   * nombre que veía el comensal era el que dijera la URL, no el real.
   *
   * `tenantDb` acota la búsqueda al negocio del slug, así que el id de una mesa
   * de otra sucursal no resuelve por más que venga escrito.
   */
  const mesaResuelta = tableId
    ? await tenantDb(business.id).table.findFirst({
        where: { id: tableId, deletedAt: null, status: { not: "INACTIVA" } },
        select: { id: true, name: true },
      })
    : null;

  const extra = parseExtraSettings(settings.rolePermissions);
  const estadoNegocio = evaluarEstadoNegocio({
    timeZone: settings.timeZone,
    scheduleEnabled: extra.scheduleEnabled,
    scheduleOpeningTime: extra.scheduleOpeningTime,
    scheduleClosingTime: extra.scheduleClosingTime,
    scheduleStatus: extra.scheduleStatus,
  });

  return (
    <ClienteMenuQr
      business={business}
      settings={{
        inventoryEnabled: settings.inventoryEnabled,
        qrMenuEnabled: settings.qrMenuEnabled,
        qrMenuBgMode: settings.qrMenuBgMode,
        qrMenuBgColor: settings.qrMenuBgColor,
        qrMenuBgGradient: settings.qrMenuBgGradient,
        qrMenuBgImageUrl: settings.qrMenuBgImageUrl,
        qrMenuLogoUrl: settings.qrMenuLogoUrl,
        qrMenuHeaderTitle: settings.qrMenuHeaderTitle,
        qrMenuHeaderSubtitle: settings.qrMenuHeaderSubtitle,
        qrMenuAccent: settings.qrMenuAccent,
        turnNumberMax: settings.turnNumberMax,
        deliveryEnabled: settings.deliveryEnabled,
        deliveryPaused: extra.deliveryPaused,
        deliveryFeeCop: settings.deliveryFeeCop,
        tipSuggestionEnabled: settings.tipSuggestionEnabled,
        tipSuggestionRateBp: settings.tipSuggestionRateBp,
        estimatedPrepTimeText: extra.estimatedPrepTimeText,
      }}
      estadoNegocio={estadoNegocio}
      categorias={categorias}
      productos={productos}
      placeholderUrl={placeholder?.imageUrl ?? null}
      mesaParam={mesaResuelta?.name}
      tableIdParam={mesaResuelta?.id}
      // Un QR que apunta a una mesa que ya no existe: se dice, en vez de dejar
      // que el comensal arme el pedido y falle recién al confirmarlo.
      mesaInvalida={Boolean(tableId) && !mesaResuelta}
      tipoParam={tipo}
    />
  );
}
