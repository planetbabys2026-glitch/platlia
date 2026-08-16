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
  comandasVivas?: number;
  domiciliosActivos?: number;
};

/** El enlace de una sección: la vista por defecto no ensucia la URL. */
export function hrefDeSeccion(item: ItemNav, seccion: SeccionNav): string {
  return seccion.vista ? `${item.href}?vista=${seccion.vista}` : item.href;
}

export function construirNavegacion({
  usaMesas,
  usaCocina,
  usaDomicilios,
  puedeVerInventario,
  usaRecetas = false,
  puedeFacturar,
  esPropietario,
  comandasVivas,
  domiciliosActivos,
}: Contexto): { grupos: GrupoNav[]; administracion: ItemNav[] } {
  const operacion: ItemNav[] = [
    // Salón y POS son excluyentes: un negocio que no sienta mesas entra por el
    // mostrador, y /salon le responde 404.
    usaMesas
      ? { titulo: "Salón", href: "/salon", icono: LayoutGrid, enBarraInferior: true }
      : { titulo: "POS", href: "/pos", icono: Calculator, enBarraInferior: true },
    // El módulo se puede apagar por empresa y la página responde 404: hasta
    // ahora el ítem se pintaba igual y llevaba a una pantalla que no existe.
    ...(usaCocina
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
    {
      titulo: "Caja",
      href: "/caja",
      icono: CreditCard,
      enBarraInferior: true,
      secciones: [
        { titulo: "Cobrar cuentas", vista: "" },
        { titulo: "Movimientos y cierre", vista: "movimientos" },
      ],
    },
    ...(usaDomicilios
      ? [{ titulo: "Domicilios", href: "/domicilios", icono: Bike, insignia: domiciliosActivos }]
      : []),
    { titulo: "Turnero", href: "/turnero", icono: MonitorPlay },
  ];

  const gestion: ItemNav[] = [
    ...(puedeVerInventario
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
    /**
     * Configuración sale de Administración y queda al mismo nivel.
     *
     * Adentro tiene siete pantallas: dejarla como sub-ítem de un acordeón habría
     * obligado a anidar un acordeón dentro de otro, tres niveles en una barra de
     * 240px. Al mismo nivel, todo el menú tiene una sola profundidad.
     */
    ...(esPropietario
      ? [
          {
            titulo: "Configuración",
            href: "/administracion/configuracion",
            icono: SlidersHorizontal,
            secciones: [
              { titulo: "Datos del negocio", vista: "" },
              { titulo: "Módulos", vista: "modulos" },
              { titulo: "Turnero TV", vista: "turnero" },
              { titulo: "Menú digital QR", vista: "qr" },
              { titulo: "Operación y recibos", vista: "operacion" },
              { titulo: "Facturación DIAN", vista: "factus" },
              // La licencia vive acá y no suelta en el menú: es un parámetro del
              // negocio, no una pantalla de trabajo, y se busca donde se busca
              // todo lo demás que se configura una vez.
              ...(puedeFacturar ? [{ titulo: "Licencia y sucursales", vista: "licencia" }] : []),
            ],
          },
        ]
      : []),
  ];

  const administracion: ItemNav[] = [
    { titulo: "Carta", href: "/administracion/carta", icono: BookOpen },
    ...(usaMesas
      ? [{ titulo: "Salón", href: "/administracion/salon", icono: LayoutGrid }]
      : []),
    { titulo: "Equipo", href: "/administracion/equipo", icono: Users },
    // Configuración solo sube a Gestión para quien la puede tocar; el resto la
    // sigue viendo acá para no perder el acceso.
    ...(esPropietario
      ? []
      : [
          {
            titulo: "Configuración",
            href: "/administracion/configuracion",
            icono: Settings,
          },
        ]),
  ];

  return {
    grupos: [
      { titulo: "Operación", items: operacion },
      { titulo: "Gestión", items: gestion },
    ],
    administracion,
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
