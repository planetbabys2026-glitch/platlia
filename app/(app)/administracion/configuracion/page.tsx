import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppModule, Role } from "@/generated/prisma/enums";
import {
  getConfiguracionDeImpresion,
  getDescargasDelAgente,
  getSettings,
} from "@/features/negocio/queries";
import { getCajasDelNegocio } from "@/features/caja/queries";
import { parseExtraSettings } from "@/features/negocio/extra-settings";
import { getFacturacion } from "@/features/facturacion/queries";
import { requireRole } from "@/lib/auth/dal";
import { tienePermisoSeccion } from "@/lib/auth/permisos-roles";
import { faltantesParaFacturar } from "@/lib/billing/factus-habilitacion";
import { plataformaFacturaConfigurada } from "@/lib/billing/factus-plataforma";
import { cuentaDelPropietario } from "@/lib/billing/cuenta";
import { preciosVigentes } from "@/lib/billing/lista";
import { tenantDb } from "@/lib/db/tenant";
import { env } from "@/lib/env";
import { contarSedesDeLaCuenta } from "@/lib/billing/cuenta";
import { EncabezadoPantalla } from "@/components/marca/pantalla";
import { PanelConfiguracion } from "./panel-configuracion";

export const metadata: Metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const ctx = await requireRole(Role.ADMINISTRADOR, Role.CAJERO, Role.MESERO, Role.COCINA);
  const esPropietario = ctx.role === Role.PROPIETARIO;
  const db = tenantDb(ctx.business.id);

  const [negocio, settings, facturacion, mesas] = await Promise.all([
    db.business.findFirstOrThrow({
      select: {
        name: true,
        slug: true,
        legalName: true,
        taxId: true,
        address: true,
        phone: true,
        email: true,
        logoUrl: true,
      },
    }),
    getSettings(ctx.business.id),
    esPropietario ? getFacturacion(ctx.business.id) : Promise.resolve(null),
    db.table.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!esPropietario && !tienePermisoSeccion(ctx.role, "configuracion", settings.rolePermissions)) {
    notFound();
  }

  /**
   * El precio de la licencia sale de la CUENTA y de la LISTA, nunca de esta sede.
   *
   * La tarjeta pintaba `suscripcion.priceCop` crudo: parado en la sede principal
   * con dos sedes mostraba solo el precio de la primera, y parado en la segunda
   * mostraba **$0**, porque la suscripción hija nace en cero. Encima los planes
   * estaban escritos a mano en el JSX con números que ya no coincidían con lo que
   * cobra el checkout.
   *
   * Va la lista vigente y la cantidad de sedes: `lib/billing/precios.ts` es puro,
   * así que el componente cliente cotiza con la misma función que el cobro.
   */
  // Solo quien administra configura impresoras: una mal apuntada manda las
  // comandas al cuarto equivocado.
  const puedeAdministrar = esPropietario || ctx.role === Role.ADMINISTRADOR;
  const impresion = puedeAdministrar
    ? {
        ...(await getConfiguracionDeImpresion(ctx.business.id)),
        descargas: getDescargasDelAgente(),
        // La URL sale del entorno y no se escribe a mano en la pantalla: es la
        // que el agente tiene que poner en su configuración, y una mal copiada
        // es media hora de alguien preguntándose por qué no conecta.
        urlDelServidor: env.APP_URL,
      }
    : null;

  const cuenta = esPropietario ? await cuentaDelPropietario(ctx.user.id) : null;
  const precios = esPropietario ? await preciosVigentes() : null;
  const licencia =
    esPropietario && precios
      ? {
          sedes: cuenta?.sedes ?? 1,
          lista: precios.vigente,
          // La base viaja aparte para poder decir de cuánto bajó y hasta cuándo:
          // una promo sin anunciar se ve igual que la tarifa de siempre.
          base: precios.base,
          promo: precios.promo,
        }
      : null;

  /**
   * Las credenciales de Factus NO cruzan a un componente cliente.
   *
   * `PanelConfiguracion` es `"use client"`: todo lo que reciba viaja al navegador
   * dentro de la carga de RSC y se puede leer en el código fuente de la página.
   *
   * Antes había que sacarle a mano las cuatro credenciales de Factus. Ya no viven
   * en `BusinessSettings` —la cuenta es de la plataforma y está en el entorno—,
   * así que no queda ningún secreto en esta tabla que pueda colarse.
   */

  const extra = parseExtraSettings(settings.rolePermissions);

  /**
   * Las conexiones de IA, solo para el propietario.
   *
   * Se consulta con `tenantDb`, así que la lista es de esta sede y de ninguna
   * otra. Nunca sale el token —de él solo existe el hash— sino el nombre y
   * cuándo se usó por última vez, que es lo que le permite al dueño reconocer
   * cuál apagar.
   */
  const conexionesIa = esPropietario
    ? await db.tokenIa.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          nombre: true,
          ultimoUsoEn: true,
          createdAt: true,
          expiresAt: true,
          clientId: true,
        },
      })
    : null;

  // Cuántas sedes tiene la cuenta: la pantalla solo aclara de cuál es la llave
  // cuando hay más de una, porque con una sola decirlo es ruido.
  const sedesDeLaCuenta = esPropietario
    ? await contarSedesDeLaCuenta(ctx.business.id)
    : 1;

  // Las cajas físicas y el estado de la clave de salidas: las dos son del
  // propietario, así que ni siquiera se consultan para los demás.
  const cajas = esPropietario ? await getCajasDelNegocio(ctx.business.id) : null;

  /**
   * El hash de la clave de salidas NO cruza al navegador.
   *
   * `settings` se pasa entero con un spread, así que toda columna nueva de
   * `BusinessSettings` viaja sola al componente cliente. Eso estuvo bien mientras
   * la tabla no guardó secretos —las credenciales de Factus se sacaron de acá por
   * este mismo motivo— y deja de estarlo con `expensePinHash` adentro. Se saca
   * explícitamente y a la pantalla va un booleano.
   */
  const { expensePinHash, ...settingsSinSecretos } = settings;

  return (
    <div className="space-y-6">
      {/* El `h1` estaba copiado a mano con su propio `clamp`, así que era la única
          pantalla del producto sin la guía punteada que cierra el encabezado en
          todas las demás. */}
      <EncabezadoPantalla
        titulo="Configuración"
        descripcion="Todo lo que acá se cambia vale solo para este negocio."
      />

      <PanelConfiguracion
        negocio={negocio}
        settings={{
          ...settingsSinSecretos,
          scheduleEnabled: extra.scheduleEnabled,
          scheduleOpeningTime: extra.scheduleOpeningTime,
          scheduleClosingTime: extra.scheduleClosingTime,
          scheduleStatus: extra.scheduleStatus,
          deliveryPaused: extra.deliveryPaused,
          estimatedPrepTimeText: extra.estimatedPrepTimeText,
          qrMenuFuente: extra.qrMenuFuente,
          qrMenuCarta: extra.qrMenuCarta,
          qrMenuBordes: extra.qrMenuBordes,
          faltantesParaFacturar: faltantesParaFacturar(settings, plataformaFacturaConfigurada()),
        }}
        facturacion={facturacion}
        licencia={licencia}
        impresion={impresion}
        mesasHabilitado={ctx.modules.has(AppModule.MESAS)}
        esPropietario={esPropietario}
        slug={negocio.slug}
        mesas={mesas}
        conexionesIa={
          conexionesIa?.map(({ clientId, ...c }) => ({ ...c, porOauth: clientId !== null })) ?? null
        }
        sede={negocio.name}
        cantidadDeSedes={sedesDeLaCuenta}
        cajas={cajas}
        claveSalidasPuesta={Boolean(expensePinHash)}
        urlMcp={`${env.APP_URL}/api/mcp`}
      />
    </div>
  );
}
