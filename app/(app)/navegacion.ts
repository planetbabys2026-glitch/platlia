import {
  BarChart3,
  Bike,
  BookOpen,
  Boxes,
  Calculator,
  ChefHat,
  CreditCard,
  LayoutGrid,
  MonitorPlay,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { tienePermisoSeccion, type SeccionPermiso } from "@/lib/auth/permisos-roles";

/**
 * El menú, en un solo lugar.
 *
 * Antes vivía tres veces dentro de `app-shell.tsx` —barra de escritorio, cajón
 * móvil y barra inferior— y las tres listas ya habían derivado entre sí: la de
 * abajo, por ejemplo, tenía los destinos escritos a mano, así que apagar el
 * módulo de domicilios los sacaba de dos menús y no del tercero.
 *
 * Los módulos que por dentro son varias pantallas —Caja, Informes, Inventario,
 * Configuración— declaran sus `secciones` y el menú las despliega. Antes esas
 * vistas solo existían como una tira de pestañas adentro de la pantalla: para
 * saber que Inventario tenía Proveedores había que entrar y mirar. La sección
 * viaja en la URL (`?vista=`), que es lo que permite enlazarla desde acá.
 */

export type SeccionNav = {
  titulo: string;
  /** El valor de `?vista=`. Vacío = la sección por defecto, sin parámetro. */
  vista: string;
  /** Cuántos pendientes tiene esta subsección específica. */
  insignia?: number;
};

export type ItemNav = {
  titulo: string;
  href: string;
  icono: React.ElementType;
  /** Cuántos pendientes tiene ese destino ahora mismo. */
  insignia?: number;
  /** Sale en la barra inferior del teléfono, donde solo entran cuatro. */
  enBarraInferior?: boolean;
  /** Vistas internas. Si están, el ítem se dibuja como acordeón. */
  secciones?: SeccionNav[];
};

export type GrupoNav = {
  titulo: string;
  items: ItemNav[];
  /**
   * Si el acordeón de Administración cuelga de este grupo.
   *
   * Antes el shell lo enganchaba comparando `grupo.titulo === "Gestión"` en dos
   * lugares distintos: renombrar el grupo borraba Administración del menú entero
   * sin que nada fallara.
   */
  conAdministracion?: boolean;
};

type Contexto = {
  usaMesas: boolean;
  usaCocina: boolean;
  usaDomicilios: boolean;
  puedeVerInventario: boolean;
  usaRecetas?: boolean;
  /** Solo quien puede pagar ve la licencia. */
  puedeFacturar?: boolean;
  esPropietario?: boolean;
  role?: Role | string | null;
  rolePermissions?: string | null;
  comandasVivas?: number;
  domiciliosActivos?: number;
  /** Cuentas esperando cobro. Es el contador que llevaba la píldora de Caja. */
  cuentasPorCobrar?: number;
};

/** El enlace de una sección: la vista por defecto no ensucia la URL. */
export function hrefDeSeccion(item: ItemNav, seccion: SeccionNav): string {
  return seccion.vista ? `${item.href}?vista=${seccion.vista}` : item.href;
}

/**
 * Las secciones de Caja y cuál es la de entrada.
 *
 * Vive acá —y no suelto en cada archivo— porque el menú y la pantalla tienen que
 * coincidir: un negocio de mostrador no tiene cuentas de mesa que cobrar, así que
 * "Cobrar cuentas" no se le ofrece y la vista de entrada pasa a ser el historial.
 * Si divergen, el enlace del menú lleva a una pantalla vacía.
 *
 * Depende de `usaMesas`, que es configuración del negocio y no dato del momento:
 * el enlace sigue siendo estable, que es lo que importaba.
 */
export function seccionesDeCaja(cobraCuentas: boolean, cuentasPorCobrar?: number): SeccionNav[] {
  return [
    ...(cobraCuentas
      ? [{ titulo: "Cobrar cuentas", vista: "", insignia: cuentasPorCobrar }]
      : []),
    { titulo: "Cuentas cobradas", vista: cobraCuentas ? "cobradas" : "" },
    { titulo: "Movimientos y cierre", vista: "movimientos" },
  ];
}

/** La vista de entrada de `/caja`, la que va sin `?vista=`. */
export function vistaInicialDeCaja(cobraCuentas: boolean): "cobros" | "cobradas" {
  return cobraCuentas ? "cobros" : "cobradas";
}

export function construirNavegacion({
  usaMesas,
  usaCocina,
  usaDomicilios,
  puedeVerInventario,
  usaRecetas = false,
  puedeFacturar,
  esPropietario,
  role,
  rolePermissions,
  comandasVivas,
  domiciliosActivos,
  cuentasPorCobrar,
}: Contexto): {
  grupos: GrupoNav[];
  administracion: ItemNav[];
  configuracion: ItemNav | null;
} {
  const puedeVer = (seccion: SeccionPermiso) => {
    if (!role) return true;
    return tienePermisoSeccion(role as Role, seccion, rolePermissions);
  };

  const operacion: ItemNav[] = [
    ...(puedeVer("salon_pos")
      ? [
          usaMesas
            ? { titulo: "Salón", href: "/salon", icono: LayoutGrid, enBarraInferior: true }
            : { titulo: "POS", href: "/pos", icono: Calculator, enBarraInferior: true },
        ]
      : []),
    ...(usaCocina && puedeVer("cocina")
      ? [
          {
            titulo: "Cocina",
            href: "/cocina",
            icono: ChefHat,
            insignia: comandasVivas,
            enBarraInferior: true,
          },
        ]
      : []),
    ...(puedeVer("caja")
      ? [
          {
            titulo: "Caja",
            href: "/caja",
            icono: CreditCard,
            // Un negocio de puro domicilio también cobra cuentas: atarlo a mesas
            // le dejaba la caja vacía justo a quien más la necesita.
            insignia: usaMesas || usaDomicilios ? cuentasPorCobrar : undefined,
            enBarraInferior: true,
            secciones: seccionesDeCaja(usaMesas || usaDomicilios, cuentasPorCobrar),
          },
        ]
      : []),
    ...(usaDomicilios && puedeVer("domicilios")
      ? [{ titulo: "Domicilios", href: "/domicilios", icono: Bike, insignia: domiciliosActivos }]
      : []),
    ...(puedeVer("turnero")
      ? [{ titulo: "Turnero", href: "/turnero", icono: MonitorPlay }]
      : []),
  ];

  const gestion: ItemNav[] = [
    ...(puedeVerInventario && puedeVer("inventario")
      ? [
          {
            titulo: "Inventario",
            href: "/inventario",
            icono: Boxes,
            secciones: [
              { titulo: "Insumos", vista: "" },
              { titulo: "Bebidas y reventa", vista: "bebidas" },
              { titulo: "Facturas de compra", vista: "facturas" },
              ...(usaRecetas ? [{ titulo: "Recetas", vista: "recetas" }] : []),
              { titulo: "Proveedores", vista: "proveedores" },
            ],
          },
        ]
      : []),
    ...(puedeVer("informes")
      ? [
          {
            titulo: "Informes",
            href: "/informes",
            icono: BarChart3,
            secciones: [
              { titulo: "Ventas del día", vista: "" },
              { titulo: "Productos más vendidos", vista: "productos" },
              { titulo: "Anulaciones", vista: "anulaciones" },
              { titulo: "Alertas de inventario", vista: "inventario" },
            ],
          },
        ]
      : []),
  ];

  const configuracion: ItemNav | null = esPropietario
    ? {
        titulo: "Configuración",
        href: "/administracion/configuracion",
        icono: SlidersHorizontal,
        secciones: [
          { titulo: "Datos del negocio", vista: "" },
          { titulo: "Módulos", vista: "modulos" },
          { titulo: "Permisos de roles", vista: "permisos" },
          { titulo: "Turnero TV", vista: "turnero" },
          { titulo: "Menú digital QR", vista: "qr" },
          { titulo: "Operación y recibos", vista: "operacion" },
    { titulo: "Impresoras", vista: "impresoras" },
          { titulo: "Facturación DIAN", vista: "factus" },
          ...(puedeFacturar ? [{ titulo: "Licencia y sucursales", vista: "licencia" }] : []),
        ],
      }
    : null;

  const administracion: ItemNav[] = [
    ...(puedeVer("carta")
      ? [{ titulo: "Carta", href: "/administracion/carta", icono: BookOpen }]
      : []),
    ...(usaMesas && puedeVer("salon_plano")
      ? [{ titulo: "Salón", href: "/administracion/salon", icono: LayoutGrid }]
      : []),
    ...(puedeVer("equipo")
      ? [{ titulo: "Equipo", href: "/administracion/equipo", icono: Users }]
      : []),
    ...(esPropietario
      ? []
      : puedeVer("configuracion")
      ? [
          {
            titulo: "Configuración",
            href: "/administracion/configuracion",
            icono: Settings,
          },
        ]
      : []),
  ];

  return {
    grupos: [
      { titulo: "Operación", items: operacion },
      { titulo: "Gestión", items: gestion, conAdministracion: true },
    ],
    administracion,
    configuracion,
  };
}

/**
 * La barra inferior del teléfono tiene lugar para cuatro destinos y el botón de
 * "Más". Se toman de la misma lista para que nunca ofrezca algo que el menú
 * grande ya no tiene.
 */
export function itemsDeBarraInferior(grupos: GrupoNav[]): ItemNav[] {
  return grupos
    .flatMap((g) => g.items)
    .filter((i) => i.enBarraInferior)
    .slice(0, 4);
}

/** Una ruta está activa si es la misma o si la actual cuelga de ella. */
export function esRutaActiva(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(base + "/");
}
