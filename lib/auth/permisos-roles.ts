import { Role } from "@/generated/prisma/enums";

/**
 * Secciones del sistema que pueden ser habilitadas o deshabilitadas por rol.
 */
export type SeccionPermiso =
  | "salon_pos"
  | "pos"
  | "cocina"
  | "caja"
  | "cartera"
  | "domicilios"
  | "turnero"
  | "inventario"
  | "informes"
  | "carta"
  | "salon_plano"
  | "equipo"
  | "configuracion";

export type InfoSeccion = {
  id: SeccionPermiso;
  nombre: string;
  descripcion: string;
  categoria: "Operación" | "Gestión" | "Administración";
};

export const SECCIONES_SISTEMA: readonly InfoSeccion[] = [
  {
    /**
     * De fábrica solo la ve el MESERO.
     *
     * El salón es la pantalla de tomar pedidos en la mesa, desde un celular o una
     * tableta, parado al lado del comensal. El cajero cobra desde `/caja` y el
     * administrador supervisa desde Informes: ninguno de los dos toma pedidos, y
     * tenerla encendida les llenaba el menú —y la barra inferior del teléfono, que
     * son cuatro lugares— con una pantalla que no usan.
     *
     * Sigue siendo configurable: un negocio chico donde el cajero también atiende
     * mesas lo enciende desde Configuración → Permisos de roles. Lo que cambió es
     * el valor por defecto, no la posibilidad.
     */
    id: "salon_pos",
    nombre: "Salón",
    descripcion:
      "Plano de mesas y toma de pedidos en la mesa, desde celular o tableta. Es la pantalla del mesero.",
    categoria: "Operación",
  },
  {
    /**
     * Separado del salón a propósito: un mesero toma pedidos en la mesa pero no
     * vende de mostrador. Con un solo permiso para las dos cosas, dejarle el
     * salón le dejaba también el punto de venta.
     *
     * El id es nuevo, así que las empresas que ya tienen permisos guardados no
     * lo traen en su JSON y caen al valor por defecto de su rol: no hace falta
     * migrar nada.
     */
    id: "pos",
    nombre: "Punto de Venta (POS)",
    descripcion: "Pedidos sin mesa: para llevar, en sitio y mostrador.",
    categoria: "Operación",
  },
  {
    id: "cocina",
    nombre: "Monitor de Cocina",
    descripcion: "Pantalla de comandas y preparación de pedidos en vivo.",
    categoria: "Operación",
  },
  {
    id: "caja",
    nombre: "Caja y Cobro",
    descripcion: "Cobro de cuentas, apertura/cierre de turnos y movimientos de efectivo.",
    categoria: "Operación",
  },
  {
    /**
     * La deuda de los clientes. Va con la caja —quien cobra el abono es el
     * cajero— pero es otra pantalla: "cuentas por cobrar" en `/caja` son las
     * cuentas abiertas de HOY; Cartera es lo que quedó debiendo de otros días.
     */
    id: "cartera",
    nombre: "Cartera (fiados)",
    descripcion: "Quién debe, cuánto y desde cuándo. Registro de abonos.",
    categoria: "Gestión",
  },
  {
    id: "domicilios",
    nombre: "Logística de Domicilios",
    descripcion: "Trazabilidad, despacho y asignación de domicilios.",
    categoria: "Operación",
  },
  {
    id: "turnero",
    nombre: "Turnero TV",
    descripcion: "Pantalla pública para televisor con llamado de turnos.",
    categoria: "Operación",
  },
  {
    id: "inventario",
    nombre: "Inventario y Compras",
    descripcion: "Stock de insumos, bebidas, facturas de compra, recetas y proveedores.",
    categoria: "Gestión",
  },
  {
    id: "informes",
    nombre: "Informes y Estadísticas",
    descripcion: "Ventas del día, productos más vendidos, anulaciones y arqueos.",
    categoria: "Gestión",
  },
  {
    id: "carta",
    nombre: "Carta y Menú",
    descripcion: "Edición de productos, categorías, precios y modificadores.",
    categoria: "Administración",
  },
  {
    id: "salon_plano",
    nombre: "Plano del Salón",
    descripcion: "Distribución, nombres y configuración de mesas físicas.",
    categoria: "Administración",
  },
  {
    id: "equipo",
    nombre: "Equipo y Empleados",
    descripcion: "Alta de empleados, asignación de roles y contraseñas.",
    categoria: "Administración",
  },
  {
    id: "configuracion",
    nombre: "Configuración de la Sede",
    descripcion: "Parámetros operativos, recibos, turnero, QR y facturación DIAN.",
    categoria: "Administración",
  },
] as const;

export const ROLES_CONFIGURABLES = [
  Role.ADMINISTRADOR,
  Role.CAJERO,
  Role.MESERO,
  Role.COCINA,
] as const;

export const INFO_ROLES: Record<
  (typeof ROLES_CONFIGURABLES)[number],
  { nombre: string; descripcion: string; insignia: string }
> = {
  [Role.ADMINISTRADOR]: {
    nombre: "Administrador",
    descripcion: "Supervisión general, inventario, reportes y configuración operativa.",
    insignia: "Control general",
  },
  [Role.CAJERO]: {
    nombre: "Cajero",
    descripcion: "Cobro de cuentas, gestión de dinero en caja, turnos y domicilios.",
    insignia: "Operativo Caja",
  },
  [Role.MESERO]: {
    nombre: "Mesero",
    descripcion: "Atención en sala, comandeo en mesas y pedidos sin mesa.",
    insignia: "Operativo Sala",
  },
  [Role.COCINA]: {
    nombre: "Cocina",
    descripcion: "Preparación de platos, visualización de comandas y turnos.",
    insignia: "Operativo Cocina",
  },
};

/**
 * Valores por defecto obvios y sensatos según cada rol.
 */
export const PERMISOS_POR_DEFECTO: Record<
  (typeof ROLES_CONFIGURABLES)[number],
  Record<SeccionPermiso, boolean>
> = {
  [Role.ADMINISTRADOR]: {
    salon_pos: false,
    pos: true,
    cocina: true,
    caja: true,
    cartera: true,
    domicilios: true,
    turnero: true,
    inventario: true,
    informes: true,
    carta: true,
    salon_plano: true,
    equipo: true,
    configuracion: true,
  },
  [Role.CAJERO]: {
    // El cajero cobra, no toma pedidos en la mesa. Ver abajo, en `salon_pos`.
    salon_pos: false,
    pos: true,
    cocina: false,
    caja: true,
    // Quien recibe el abono es el cajero: la cartera se cobra en el mostrador.
    cartera: true,
    domicilios: true,
    turnero: true,
    inventario: false,
    informes: true,
    carta: false,
    salon_plano: false,
    equipo: false,
    configuracion: false,
  },
  [Role.MESERO]: {
    salon_pos: true,
    pos: false,
    cocina: false,
    caja: false,
    cartera: false,
    domicilios: false,
    turnero: true,
    inventario: false,
    informes: false,
    carta: false,
    salon_plano: false,
    equipo: false,
    configuracion: false,
  },
  [Role.COCINA]: {
    salon_pos: false,
    pos: false,
    cocina: true,
    caja: false,
    cartera: false,
    domicilios: false,
    turnero: true,
    inventario: false,
    informes: false,
    carta: false,
    salon_plano: false,
    equipo: false,
    configuracion: false,
  },
};

/**
 * Parsea con seguridad el JSON guardado en `BusinessSettings.rolePermissions`.
 */
export function parsearPermisosPersonalizados(
  rawJson?: string | null,
): Partial<Record<Role, Partial<Record<SeccionPermiso, boolean>>>> {
  if (!rawJson || typeof rawJson !== "string") return {};
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Obtiene el mapa completo de permisos resueltos para un rol específico.
 * El Propietario siempre tiene todos los permisos activos.
 */
export function obtenerPermisosRol(
  rol: Role,
  rawJson?: string | null,
): Record<SeccionPermiso, boolean> {
  // Propietario siempre tiene todo habilitado
  if (rol === Role.PROPIETARIO) {
    return {
      salon_pos: true,
      pos: true,
      cocina: true,
      caja: true,
      cartera: true,
      domicilios: true,
      turnero: true,
      inventario: true,
      informes: true,
      carta: true,
      salon_plano: true,
      equipo: true,
      configuracion: true,
    };
  }

  const defaults = PERMISOS_POR_DEFECTO[rol] ?? {
    salon_pos: false,
    pos: false,
    cocina: false,
    caja: false,
    cartera: false,
    domicilios: false,
    turnero: false,
    inventario: false,
    informes: false,
    carta: false,
    salon_plano: false,
    equipo: false,
    configuracion: false,
  };

  const personalizados = parsearPermisosPersonalizados(rawJson);
  const sobreescrituras = personalizados[rol] ?? {};

  return {
    ...defaults,
    ...sobreescrituras,
  };
}

/**
 * Verifica si un rol tiene permiso para ver una sección específica.
 */
export function tienePermisoSeccion(
  rol: Role,
  seccion: SeccionPermiso,
  rawJson?: string | null,
): boolean {
  if (rol === Role.PROPIETARIO) return true;
  const permisos = obtenerPermisosRol(rol, rawJson);
  return Boolean(permisos[seccion]);
}
