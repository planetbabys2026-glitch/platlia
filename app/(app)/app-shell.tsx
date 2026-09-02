"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  LogOut,
  Menu,
  Settings,
  Store,
  X,
} from "lucide-react";
import { Isotipo, Logotipo } from "@/components/marca/logo";
import { Button } from "@/components/ui/button";
import { salir } from "@/features/auth/actions";
import { Campana } from "@/features/avisos/campana";
import { Insignia } from "@/features/avisos/insignia";
import { ProveedorAvisos, useAvisos } from "@/features/avisos/proveedor";
import { BotonEstadoPreparaciones } from "@/features/cocina/components/panel-estado-preparaciones";
import { cn } from "@/lib/utils";
import {
  construirNavegacion,
  esRutaActiva,
  hrefDeSeccion,
  itemsDeBarraInferior,
  type ItemNav,
} from "./navegacion";

/**
 * El rol de quien está adentro.
 *
 * Un solo tratamiento para los cinco: mono en versalitas sobre un panel, con el
 * nombre del rol como único dato. Antes cada uno traía su color de la paleta
 * cruda de Tailwind —purple, blue, emerald, amber, rose—, que el manual prohíbe
 * expresamente: cinco acentos que no son de la marca compitiendo con Brasa en la
 * esquina donde justamente no hay nada que decidir.
 */
const NOMBRE_ROL: Record<string, string> = {
  PROPIETARIO: "Propietario",
  ADMINISTRADOR: "Administrador",
  CAJERO: "Cajero",
  MESERO: "Mesero",
  COCINA: "Cocina",
  COCINERO: "Cocina",
};

function InsigniaRol({ role }: { role?: string | null }) {
  if (!role) return null;
  const nombre = NOMBRE_ROL[role.toUpperCase()] ?? role;

  return (
    <span className="inline-flex items-center rounded-md bg-[var(--panel-3)] px-1.5 py-0.5 font-mono text-rotulo font-bold uppercase leading-none tracking-wider text-[var(--papel-60)]">
      {nombre}
    </span>
  );
}

type AppShellProps = {
  user: { name: string; email?: string } | null;
  businessName?: string;
  role?: string | null;
  rolePermissions?: string | null;
  usaMesas: boolean;
  usaCocina?: boolean;
  usaDomicilios?: boolean;
  usaCredito?: boolean;
  deudores?: number;
  puedeVerInventario: boolean;
  usaRecetas?: boolean;
  usaInventario?: boolean;
  puedeFacturar?: boolean;
  esPropietario?: boolean;
  /** Contadores calculados en el servidor, para que la primera pintura ya traiga el número. */
  cocinaInicial?: number;
  domiciliosInicial?: number;
  cajaInicial?: number;
  children: React.ReactNode;
};

/**
 * El shell entero cuelga del proveedor de avisos: es lo que hace que la conexión
 * en vivo sobreviva a las navegaciones del cliente, porque el layout de `(app)`
 * no se vuelve a montar al cambiar de pantalla.
 */
export function AppShell(props: AppShellProps) {
  return (
    <ProveedorAvisos
      cocinaInicial={props.cocinaInicial}
      domiciliosInicial={props.domiciliosInicial}
      cajaInicial={props.cajaInicial}
    >
      <Shell {...props} />
    </ProveedorAvisos>
  );
}

/**
 * Un ítem del cajón.
 *
 * Era el mismo componente para el cajón y para la barra de escritorio, con un
 * `denso` y un `colapsado` que iban apagando partes. Desde que la barra de
 * escritorio es un riel de iconos —que no comparte nada con esto— quedó siendo
 * solo del cajón, y usa el tamaño táctil que fija el manual: 44px de alto,
 * porque abajo de 1020px esto se toca con el dedo.
 */
function EnlaceNav({
  item,
  activo,
  onNavegar,
  vistaActual,
  abierta,
  onAlternar,
}: {
  item: ItemNav;
  activo: boolean;
  onNavegar?: () => void;
  /** El `?vista=` de la URL, para marcar la sección abierta. */
  vistaActual?: string;
  /** Si el acordeón de secciones está desplegado. */
  abierta?: boolean;
  onAlternar?: () => void;
}) {
  const Icono = item.icono;
  const idPanel = useId();
  const secciones = item.secciones;

  if (!secciones) {
    return (
      <Link
        href={item.href}
        onClick={onNavegar}
        aria-current={activo ? "page" : undefined}
        className={cn(
          "group relative flex min-h-11 items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-base font-medium transition-colors",
          activo
            ? "bg-brand/15 font-bold text-brand"
            : "text-muted-foreground hover:bg-[var(--panel-2)] hover:text-foreground",
        )}
      >
        {activo ? (
          <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand" />
        ) : null}
        <Icono
          className={cn("size-[18px] shrink-0", activo ? "text-brand" : "text-muted-foreground")}
        />
        <span className="truncate">{item.titulo}</span>
        {item.insignia !== undefined && <Insignia valor={item.insignia} />}
      </Link>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        aria-controls={idPanel}
        aria-label={`${abierta ? "Plegar" : "Desplegar"} ${item.titulo}`}
        className={cn(
          "group relative flex w-full min-h-11 items-center justify-between gap-3.5 rounded-xl px-3.5 py-2.5 text-base font-medium transition-colors",
          activo
            ? "bg-brand/15 font-bold text-brand"
            : "text-muted-foreground hover:bg-[var(--panel-2)] hover:text-foreground",
        )}
      >
        {activo ? (
          <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand" />
        ) : null}

        <span className="flex min-w-0 items-center gap-3 truncate">
          <Icono
            className={cn("size-[18px] shrink-0", activo ? "text-brand" : "text-muted-foreground")}
          />
          <span className="truncate">{item.titulo}</span>
          {item.insignia !== undefined && <Insignia valor={item.insignia} />}
        </span>

        <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 transition-transform duration-200",
              activo ? "text-brand" : "text-muted-foreground",
              abierta && "rotate-180",
          )}
        />
      </button>

      <div
          id={idPanel}
          inert={!abierta}
          aria-hidden={!abierta}
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out",
            abierta ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="ml-4 space-y-0.5 border-l border-dashed border-[var(--linea-30)] pl-3 pt-1">
              {secciones.map((seccion) => {
                const activaSeccion = activo && (vistaActual ?? "") === seccion.vista;
                return (
                  <Link
                    key={seccion.vista || "principal"}
                    href={hrefDeSeccion(item, seccion)}
                    onClick={onNavegar}
                    aria-current={activaSeccion ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      activaSeccion
                        ? "bg-brand font-bold text-brand-foreground"
                        : "text-muted-foreground hover:bg-[var(--panel-2)] hover:text-foreground",
                    )}
                  >
                    <span className="truncate">{seccion.titulo}</span>
                    {seccion.insignia !== undefined && seccion.insignia > 0 && (
                      <Insignia valor={seccion.insignia} />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
    </div>
  );
}

/**
 * Un destino del riel: o entra a un módulo, o abre un panel de secciones.
 *
 * Unifica tres cosas que en el menú ancho eran distintas —un módulo suelto, un
 * módulo con secciones y el acordeón de Administración—, porque en un riel de
 * iconos las tres se ven igual: un icono que al tocarlo o navega o despliega.
 */
type ItemRiel = {
  key: string;
  titulo: string;
  href: string;
  icono: React.ElementType;
  insignia?: number;
  /** Si tiene, el clic abre el panel en vez de navegar. */
  panel?: Array<{ titulo: string; href: string; insignia?: number }>;
  activo: boolean;
};

/** Lo que la capa flotante está mostrando: un susurro o el panel entero. */
type Flotante = {
  key: string;
  /** El borde superior del icono, para alinear la capa con él. */
  top: number;
  modo: "etiqueta" | "panel";
};

const ANCHO_RIEL = 72;

/**
 * El botón de un módulo en el riel.
 *
 * Sin recuadro, sin línea, sin píldora: al reposo solo se ve el icono en papel,
 * y activo se pinta en Brasa. El manual ya usa el color para decir "acá estás";
 * agregarle además un fondo y una barra a la izquierda era decir lo mismo tres
 * veces en 72px de ancho.
 */
function BotonRiel({
  item,
  abierto,
  onEntrar,
  onSalir,
  onActivar,
}: {
  item: ItemRiel;
  abierto: boolean;
  onEntrar: (top: number) => void;
  onSalir: () => void;
  onActivar: (top: number) => void;
}) {
  const Icono = item.icono;
  const pintado = item.activo || abierto;

  const contenido = (
    <>
      <Icono className="size-[22px]" strokeWidth={pintado ? 2.25 : 1.75} />
      {item.insignia !== undefined && item.insignia > 0 && (
        // Punto y no número: un "12" adentro de un círculo de 44px le pelea el
        // lugar al icono, que es lo único que se lee de reojo. El número está en
        // el panel, que es donde alguien va a decidir algo con él.
        <span
          aria-hidden
          className="absolute right-2 top-2 size-2 rounded-full bg-brand ring-2 ring-[var(--tinta)]"
        />
      )}
      <span className="sr-only">
        {item.titulo}
        {item.insignia ? ` (${item.insignia} pendientes)` : ""}
      </span>
    </>
  );

  const clases = cn(
    "relative flex size-11 items-center justify-center rounded-2xl transition-[color,background-color,transform] duration-150",
    "hover:bg-[var(--panel-2)] active:scale-95",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tinta)]",
    pintado ? "text-brand" : "text-[var(--papel)]",
  );

  const manejadores = {
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) =>
      onEntrar(e.currentTarget.getBoundingClientRect().top),
    onPointerLeave: onSalir,
    onFocus: (e: React.FocusEvent<HTMLElement>) =>
      onEntrar(e.currentTarget.getBoundingClientRect().top),
    onBlur: onSalir,
  };

  if (!item.panel) {
    return (
      <Link
        href={item.href}
        aria-label={item.titulo}
        aria-current={item.activo ? "page" : undefined}
        className={clases}
        {...manejadores}
      >
        {contenido}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={item.titulo}
      aria-expanded={abierto}
      aria-haspopup="menu"
      className={clases}
      onClick={(e) => onActivar(e.currentTarget.getBoundingClientRect().top)}
      {...manejadores}
    >
      {contenido}
    </button>
  );
}

/**
 * La capa que aparece a la derecha del riel.
 *
 * Es el mismo objeto en dos tamaños: al pasar el cursor es el nombre del módulo,
 * y al hacer clic es el panel con sus secciones. Se mueve siempre igual —entra
 * desde el riel hacia la derecha, 160ms— para que abrir el panel se lea como que
 * la etiqueta creció, y no como que apareció otra cosa.
 *
 * Va en `fixed` y no dentro del `<nav>` porque ese contenedor scrollea, y un
 * contenedor que scrollea recorta: la etiqueta del primer icono quedaba cortada
 * contra el borde. Es la misma trampa del `overflow-hidden` de las categorías.
 */
function CapaFlotante({
  item,
  flotante,
  onCerrar,
}: {
  item: ItemRiel;
  flotante: Flotante;
  onCerrar: () => void;
}) {
  const esPanel = flotante.modo === "panel" && item.panel;
  // Un panel largo cerca del pie se saldría de la pantalla: se sube lo justo.
  const alto = esPanel ? 96 + (item.panel?.length ?? 0) * 40 : 44;
  const top = Math.max(12, Math.min(flotante.top, window.innerHeight - alto - 12));

  return (
    <div
      style={{ top, left: ANCHO_RIEL }}
      className={cn(
        "fixed z-40 origin-left",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:duration-150 motion-safe:ease-out",
      )}
    >
      {esPanel ? (
        <div className="min-w-56 max-w-72 rounded-2xl bg-[var(--panel-2)] p-2 shadow-2xl shadow-[var(--tinta)]">
          <p className="px-3 pb-1.5 pt-1 font-mono text-rotulo font-bold uppercase tracking-[0.16em] text-[var(--linea-55)]">
            {item.titulo}
          </p>
          <ul>
            {item.panel?.map((sub) => (
              <li key={sub.href}>
                <Link
                  href={sub.href}
                  onClick={onCerrar}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium text-[var(--papel-60)] transition-colors hover:bg-[var(--panel-3)] hover:text-[var(--papel)]"
                >
                  <span className="truncate">{sub.titulo}</span>
                  {sub.insignia !== undefined && sub.insignia > 0 && (
                    <span className="numeral shrink-0 rounded-full bg-brand px-2 py-0.5 text-rotulo font-bold text-brand-foreground">
                      {sub.insignia}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        // El susurro. Sin borde: lo que lo separa del contenido es la sombra,
        // que es elevación de verdad y no una línea dibujada.
        <span className="pointer-events-none flex h-11 items-center whitespace-nowrap rounded-xl bg-[var(--panel-2)] px-3.5 text-sm font-semibold text-[var(--papel)] shadow-xl shadow-[var(--tinta)]">
          {item.titulo}
        </span>
      )}
    </div>
  );
}

/**
 * La cuenta, en el mismo objeto flotante que todo lo demás.
 *
 * Reúne lo que antes estaba suelto al pie de la barra —quién sos, en qué
 * sucursal estás, cómo cambiarla y cómo salir—. Ahí eran cinco elementos
 * peleando por 72px de ancho; acá entran holgados y el riel queda con tres
 * círculos parejos.
 */
function MenuCuenta({
  flotante,
  user,
  role,
  businessName,
  onCerrar,
}: {
  flotante: Flotante;
  user: { name: string; email?: string } | null;
  role?: string | null;
  businessName?: string;
  onCerrar: () => void;
}) {
  const top = Math.max(12, Math.min(flotante.top, window.innerHeight - 232));

  return (
    <div
      style={{ top, left: ANCHO_RIEL }}
      className="fixed z-40 w-64 origin-left rounded-2xl bg-[var(--panel-2)] p-2 shadow-2xl shadow-[var(--tinta)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:duration-150 motion-safe:ease-out"
    >
      {user && (
        <div className="space-y-1.5 px-3 pb-2 pt-1.5">
          <p className="truncate text-sm font-semibold text-[var(--papel)]">{user.name}</p>
          <InsigniaRol role={role} />
        </div>
      )}

      <Link
        href="/elegir-negocio"
        onClick={onCerrar}
        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-[var(--panel-3)]"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Store className="size-4 shrink-0 text-[var(--papel-60)]" />
          <span className="truncate text-sm font-medium text-[var(--papel)]">
            {businessName || "Mis sucursales"}
          </span>
        </span>
        <span className="shrink-0 font-mono text-rotulo font-bold uppercase tracking-wider text-brand">
          Cambiar
        </span>
      </Link>

      <form action={salir}>
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[var(--papel-60)] transition-colors hover:bg-destructive/10 hover:text-destructive-soft"
        >
          <LogOut className="size-4 shrink-0" />
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}

function RotuloGrupo({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-3 font-mono text-rotulo font-bold uppercase tracking-[0.16em] text-[var(--linea-55)]">
      — {children}
    </p>
  );
}

function Shell({
  user,
  businessName,
  role,
  rolePermissions,
  usaMesas,
  usaCocina = true,
  usaDomicilios = true,
  usaCredito = false,
  deudores,
  puedeVerInventario,
  usaRecetas,
  usaInventario,
  puedeFacturar,
  esPropietario,
  children,
}: AppShellProps) {
  const {
    cocina: comandasVivas,
    domicilios: domiciliosActivos,
    caja: cuentasPorCobrar,
  } = useAvisos();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vistaActual = searchParams.get("vista") ?? "";
  /**
   * Qué está mostrando la capa flotante del riel.
   *
   * Uno solo para las dos escalas: el susurro del hover y el panel del clic son
   * el mismo objeto, así que no pueden convivir dos. Y el panel gana: entrar con
   * el cursor a otro icono no se lo lleva puesto.
   */
  const [flotante, setFlotante] = useState<Flotante | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { grupos, administracion, configuracion } = construirNavegacion({
    usaMesas,
    usaCocina,
    usaDomicilios,
    usaCredito,
    deudores,
    puedeVerInventario,
    usaRecetas,
    usaInventario,
    puedeFacturar,
    esPropietario,
    role,
    rolePermissions,
    comandasVivas,
    domiciliosActivos,
    cuentasPorCobrar,
  });
  const barraInferior = itemsDeBarraInferior(grupos);

  /**
   * El menú del riel, en tres bloques separados solo por espacio.
   *
   * Aplana lo que en el menú ancho eran formas distintas: un módulo suelto, uno
   * con secciones y el acordeón de Administración terminan siendo lo mismo —un
   * icono que navega o abre panel—, y así el riel no tiene casos especiales.
   */
  const gruposRiel: ItemRiel[][] = [
    ...grupos.map((grupo) =>
      grupo.items.map((item) => ({
        key: item.href,
        titulo: item.titulo,
        href: item.href,
        icono: item.icono,
        insignia: item.insignia,
        panel: item.secciones?.map((seccion) => ({
          titulo: seccion.titulo,
          href: hrefDeSeccion(item, seccion),
          insignia: seccion.insignia,
        })),
        activo: esRutaActiva(pathname, item.href),
      })),
    ),
    [
      ...(administracion.length > 0
        ? [
            {
              key: "administracion",
              titulo: "Administración",
              href: administracion[0].href,
              icono: Settings,
              panel: administracion.map((sub) => ({ titulo: sub.titulo, href: sub.href })),
              activo: administracion.some((sub) => esRutaActiva(pathname, sub.href)),
            },
          ]
        : []),
      ...(configuracion
        ? [
            {
              key: configuracion.href,
              titulo: configuracion.titulo,
              href: configuracion.href,
              icono: configuracion.icono,
              panel: configuracion.secciones?.map((seccion) => ({
                titulo: seccion.titulo,
                href: hrefDeSeccion(configuracion, seccion),
                insignia: seccion.insignia,
              })),
              activo: esRutaActiva(pathname, configuracion.href),
            },
          ]
        : []),
    ],
  ].filter((grupo) => grupo.length > 0);
  const esAdminActivo = administracion.some((sub) => esRutaActiva(pathname, sub.href));
  const [adminOpen, setAdminOpen] = useState(false);
  /**
   * Qué módulos tienen las secciones desplegadas, por `href`. Solo guarda lo que
   * la persona tocó a mano; sin entrada, manda el valor por defecto, que es
   * "abierto si estoy adentro del módulo".
   *
   * Antes no había estado: las secciones se mostraban siempre que el módulo
   * estuviera activo y no había forma de cerrarlas. Ahora se abren solas al
   * entrar —que es lo que uno espera— pero se pueden plegar estando adentro,
   * igual que Administración.
   */
  const [seccionesAbiertas, setSeccionesAbiertas] = useState<Record<string, boolean>>({});

  const alternarSecciones = useCallback((href: string, abiertaAhora: boolean) => {
    setSeccionesAbiertas((previo) => ({ ...previo, [href]: !abiertaAhora }));
  }, []);

  // Abrir acordeón automáticamente si la ruta activa es de administración
  useEffect(() => {
    if (administracion.some((sub) => esRutaActiva(pathname, sub.href))) {
      setAdminOpen(true);
    }
  }, [pathname, administracion]);

  // Cerrar menú móvil al navegar a una nueva ruta
  useEffect(() => {
    setMobileOpen(false);
    setFlotante(null);
  }, [pathname]);

  /**
   * El panel del riel se cierra con Escape y tocando afuera.
   *
   * Es una capa que tapa contenido: dejarla abierta hasta que alguien acierte a
   * tocar el mismo icono otra vez la convierte en algo que estorba.
   */
  useEffect(() => {
    if (!flotante || flotante.modo !== "panel") return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFlotante(null);
    };
    const alTocar = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-riel]")) setFlotante(null);
    };
    window.addEventListener("keydown", alTeclear);
    window.addEventListener("pointerdown", alTocar);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      window.removeEventListener("pointerdown", alTocar);
    };
  }, [flotante]);

  // Con el cajón abierto la página de atrás no se scrollea: si no, el dedo
  // arrastra el contenido que está debajo del velo en vez del menú.
  useEffect(() => {
    if (!mobileOpen) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [mobileOpen]);

  // Escape cierra el cajón, como cualquier capa modal.
  useEffect(() => {
    if (!mobileOpen) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [mobileOpen]);

  /**
   * El acordeón de Administración del cajón.
   *
   * Ya no recibe `denso`: la barra de escritorio es un riel de iconos y arma
   * Administración como un panel más, así que esto quedó siendo solo del cajón,
   * que se toca con el dedo y usa el tamaño táctil del manual.
   */
  const acordeonAdmin = () => (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setAdminOpen(!adminOpen)}
        aria-expanded={adminOpen}
        aria-controls="admin-cajon"
        className={cn(
          "group relative flex w-full min-h-11 items-center justify-between gap-3.5 rounded-xl px-3.5 py-2.5 text-base font-medium transition-colors",
          esAdminActivo
            ? "bg-brand/15 font-bold text-brand"
            : "text-muted-foreground hover:bg-[var(--panel-2)] hover:text-foreground",
        )}
      >
        {esAdminActivo ? (
          <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand" />
        ) : null}

        <span className="flex min-w-0 items-center gap-3 truncate">
          <Settings
            className={cn(
              "size-[18px] shrink-0",
              esAdminActivo ? "text-brand" : "text-muted-foreground",
            )}
          />
          <span className="truncate">Administración</span>
        </span>
        <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 transition-transform duration-200",
              esAdminActivo ? "text-brand" : "text-muted-foreground",
            adminOpen && "rotate-180",
          )}
        />
      </button>

      <div
          id="admin-cajon"
          // Misma técnica que las secciones de un módulo: `grid-template-rows`
          // de 0fr a 1fr llega a la altura real sin medirla con JS. Antes el
          // submenú aparecía de golpe y solo giraba la flecha.
          inert={!adminOpen}
          aria-hidden={!adminOpen}
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out",
            adminOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="ml-4 space-y-0.5 border-l border-dashed border-[var(--linea-30)] pl-3 pt-1">
              {administracion.map((sub) => {
                const SubIcono = sub.icono;
                const activo = pathname === sub.href;

                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={activo ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      activo
                        ? "bg-brand font-bold text-brand-foreground"
                        : "text-muted-foreground hover:bg-[var(--panel-2)] hover:text-foreground",
                    )}
                  >
                    <SubIcono className="size-4 shrink-0" />
                    <span className="truncate">{sub.titulo}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
    </div>
  );

  const logoHref = role?.toUpperCase() === "COCINA" ? "/cocina" : "/panel";
  const esCocina = role?.toUpperCase() === "COCINA";

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ─────────────────────────────────────────────────────────────
          1. EL RIEL (tableta: 1020px en adelante)
          Del mismo color que el contenido y sin un solo borde: lo único que se
          ve son los iconos. Lo que separa los tres grupos es el espacio, que es
          el único divisor que queda cuando no hay ni rótulos ni líneas.
          El punto de corte es el del export y no el `md` de Tailwind: con `md`
          (768px) una tablet vertical de 820px se comía la barra entera.
          ───────────────────────────────────────────────────────────── */}
      <aside
        // Con nombre porque no es el único `<aside>` de la aplicación: la
        // pantalla de una cuenta tiene el suyo, y dos landmarks sin nombre son
        // indistinguibles tanto para un lector de pantalla como para una prueba.
        aria-label="Menú principal"
        style={{ width: ANCHO_RIEL }}
        data-riel
        className="sticky top-0 z-30 hidden h-screen shrink-0 flex-col items-center bg-[var(--tinta)] py-3 tableta:flex"
        onPointerLeave={() => setFlotante((f) => (f && f.modo === "panel" ? f : null))}
      >
        <Link
          href={logoHref}
          aria-label="Ir al inicio"
          className="mb-3 flex size-11 items-center justify-center rounded-2xl transition-colors hover:bg-[var(--panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Isotipo className="h-7 w-auto" />
        </Link>

        <nav aria-label="Módulos" className="scrollbar-none flex flex-1 flex-col items-center gap-1 overflow-y-auto">
          {gruposRiel.map((grupo, i) => (
            <div key={i} className={cn("flex flex-col items-center gap-1", i > 0 && "mt-4")}>
              {grupo.map((item) => (
                <BotonRiel
                  key={item.key}
                  item={item}
                  abierto={flotante?.key === item.key && flotante.modo === "panel"}
                  onEntrar={(top) =>
                    setFlotante((f) =>
                      f && f.modo === "panel" ? f : { key: item.key, top, modo: "etiqueta" as const },
                    )
                  }
                  onSalir={() => setFlotante((f) => (f && f.modo === "panel" ? f : null))}
                  onActivar={(top) =>
                    setFlotante((f) =>
                      f && f.key === item.key && f.modo === "panel"
                        ? null
                        : { key: item.key, top, modo: "panel" as const },
                    )
                  }
                />
              ))}
            </div>
          ))}
        </nav>

        {/* El pie: los mismos círculos de 44px que el resto del riel, para que no
            se lea como otra cosa pegada abajo. La sucursal, el nombre y el cierre
            de sesión viven adentro del menú de la cuenta: cinco elementos no
            entran en 72px sin amontonarse, y era justamente lo que pasaba. */}
        <div className="mt-2 flex shrink-0 flex-col items-center gap-1">
          {/* Los dos vienen del sistema con su propio tamaño y su gris de texto.
              Acá se los alinea al riel —44px, esquinas del mismo radio, icono en
              papel— porque si no se leen como algo pegado abajo en vez de como
              dos destinos más de la misma barra. */}
          {!esCocina && (
            <BotonEstadoPreparaciones
              size="icon"
              variant="ghost"
              className="size-11 rounded-2xl text-[var(--papel)] hover:bg-[var(--panel-2)] hover:text-[var(--papel)]"
            />
          )}
          <Campana className="size-11 rounded-2xl text-[var(--papel)] hover:bg-[var(--panel-2)] hover:text-[var(--papel)] md:size-11" />
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={flotante?.key === "cuenta"}
            aria-label={`Cuenta de ${user?.name ?? "usuario"}`}
            onClick={(e) => {
              /**
               * El `top` se mide ACÁ, no adentro del actualizador.
               *
               * React llama al actualizador de `useState` más tarde, durante el
               * render, y para entonces ya dejó `currentTarget` en `null`: leerlo
               * ahí tira "Cannot read properties of null" y el menú de la cuenta
               * no abría nunca —se caía la pantalla entera al borde de error—.
               * Es el mismo motivo por el que `BotonRiel` recibe un número y no
               * el evento.
               */
              const top = e.currentTarget.getBoundingClientRect().top;
              setFlotante((f) =>
                f?.key === "cuenta" ? null : { key: "cuenta", top, modo: "panel" as const },
              );
            }}
            className={cn(
              "flex size-11 items-center justify-center rounded-full font-mono text-xs font-bold uppercase transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tinta)]",
              flotante?.key === "cuenta"
                ? "bg-brand text-brand-foreground"
                : "bg-[var(--panel-3)] text-[var(--papel)] hover:bg-[var(--panel-2)]",
            )}
          >
            {(user?.name ?? "?").slice(0, 2)}
          </button>
        </div>

        {/* La capa flotante, fuera del `<nav>` que scrollea. */}
        {flotante &&
          (flotante.key === "cuenta" ? (
            <MenuCuenta
              flotante={flotante}
              user={user}
              role={role}
              businessName={businessName}
              onCerrar={() => setFlotante(null)}
            />
          ) : (
            (() => {
              const item = gruposRiel.flat().find((x) => x.key === flotante.key);
              return item ? (
                <CapaFlotante
                  item={item}
                  flotante={flotante}
                  onCerrar={() => setFlotante(null)}
                />
              ) : null;
            })()
          ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ─────────────────────────────────────────────────────────────
            2. BARRA SUPERIOR PARA TELÉFONO Y TABLET (< 1020px)
            ───────────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-[color-mix(in_oklch,var(--tinta)_88%,transparent)] px-4 backdrop-blur tableta:hidden">
          <div className="flex items-center gap-3">
            {/* Solo de tablet para arriba.
                En el teléfono este botón estaba repetido: la barra de abajo ya
                tiene "Más", que abre el mismo cajón y queda al alcance del pulgar.
                Entre 640 y 1020px esa barra no existe —ahí estorba a los paneles
                que se anclan al borde inferior—, así que ahí este botón sigue
                siendo la única puerta al menú y tiene que quedarse. */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú de navegación"
              aria-expanded={mobileOpen}
              className="hidden text-foreground sm:inline-flex"
            >
              <Menu className="size-5" />
            </Button>

            {/* `min-h-11` en el enlace del logo: es un destino más del menú y en el
                teléfono se toca con el pulgar como cualquier otro. */}
            <Link href={logoHref} className="flex min-h-11 items-center">
              <Logotipo size="sm" />
            </Link>
          </div>

          <div className="flex items-center gap-1.5">
            {!esCocina && <BotonEstadoPreparaciones size="icon-sm" variant="ghost" />}
            <Campana />
            <Button
              asChild
              variant="outline"
              size="sm"
              className="min-h-11 gap-1 rounded-lg border-brand/40 px-2 text-rotulo font-bold text-brand-accent"
              title="Cambiar sucursal"
            >
              <Link href="/elegir-negocio">
                <Store className="size-3.5" />
                <span className="max-w-[80px] truncate">{businessName || "Sucursales"}</span>
              </Link>
            </Button>
          </div>
        </header>

        {/* ─────────────────────────────────────────────────────────────
            3. CAJÓN DE NAVEGACIÓN (< 1020px)
            ───────────────────────────────────────────────────────────── */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex tableta:hidden">
            {/* El velo dejaba pasar cero luz: era `bg-[var(--tinta)]` a secas, o sea
                opaco, y tapaba del todo la pantalla de atrás. `--tinta-soft` existe
                justamente para esto. */}
            <div
              className="fixed inset-0 bg-[var(--tinta-soft)] backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />

            <div className="animate-in slide-in-from-left relative z-10 flex w-[min(300px,86vw)] flex-col bg-[var(--tinta)] shadow-2xl duration-200">
              <div className="flex h-16 items-center justify-between px-4">
                <Logotipo size="sm" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Cerrar menú de navegación"
                  className="text-muted-foreground"
                >
                  <X className="size-5" />
                </Button>
              </div>

              <nav className="flex-1 space-y-6 overflow-y-auto p-4">
                {grupos.map((grupo) => (
                  <div key={grupo.titulo} className="space-y-1">
                    <RotuloGrupo>{grupo.titulo}</RotuloGrupo>
                    {grupo.items.map((item) => {
                      const activo = esRutaActiva(pathname, item.href);
                      const abierta = seccionesAbiertas[item.href] ?? activo;
                      return (
                        <EnlaceNav
                          key={item.href}
                          item={item}
                          activo={activo}
                          onNavegar={() => setMobileOpen(false)}
                          vistaActual={vistaActual}
                          abierta={abierta}
                          onAlternar={() => alternarSecciones(item.href, abierta)}
                        />
                      );
                    })}
                    {grupo.conAdministracion ? (
                      <>
                        {acordeonAdmin()}
                        {configuracion && (
                          <EnlaceNav
                            key={configuracion.href}
                            item={configuracion}
                            activo={esRutaActiva(pathname, configuracion.href)}
                            onNavegar={() => setMobileOpen(false)}
                            vistaActual={vistaActual}
                            abierta={
                              seccionesAbiertas[configuracion.href] ??
                              esRutaActiva(pathname, configuracion.href)
                            }
                            onAlternar={() =>
                              alternarSecciones(
                                configuracion.href,
                                seccionesAbiertas[configuracion.href] ??
                                  esRutaActiva(pathname, configuracion.href),
                              )
                            }
                          />
                        )}
                      </>
                    ) : null}
                  </div>
                ))}
              </nav>

              <div className="space-y-3 border-t border-dashed border-[var(--linea-30)] bg-[var(--panel-bg)] p-4">
                {user && (
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full border border-[var(--linea-30)] bg-[var(--panel-3)] text-sm font-bold uppercase text-foreground">
                      {user.name.slice(0, 2)}
                    </div>
                    <div className="truncate text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-foreground">{user.name}</p>
                        <InsigniaRol role={role} />
                      </div>
                      {businessName && (
                        <p className="truncate text-muted-foreground">{businessName}</p>
                      )}
                    </div>
                  </div>
                )}

                <form action={salir}>
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full justify-start gap-2 border-destructive/30 text-destructive-soft hover:bg-destructive/10"
                  >
                    <LogOut className="size-4" />
                    Cerrar sesión
                  </Button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            4. BARRA RÁPIDA INFERIOR (solo teléfono)
            Se corta en `sm` y no en `tableta`: en una tablet ya está el cajón y
            la barra de arriba, y abajo estorba a los paneles de cuenta que se
            anclan al mismo borde.
            ───────────────────────────────────────────────────────────── */}
        <nav
          aria-label="Accesos rápidos"
          className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around bg-[color-mix(in_oklch,var(--tinta)_92%,transparent)] px-2 backdrop-blur sm:hidden"
        >
          {barraInferior.map((item) => {
            const Icono = item.icono;
            const activo = esRutaActiva(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "relative flex w-16 flex-col items-center justify-center gap-1 py-1 font-medium transition-colors",
                  activo ? "font-bold text-brand" : "text-[var(--papel-60)]",
                )}
              >
                <Icono className="size-5" />
                {/* El tamaño va en el rótulo y no en el contenedor: `text-rotulo`
                    es un tamaño del `@theme`, y tailwind-merge lo confunde con un
                    color, así que el `text-…` de color que venía después lo
                    borraba. Estos tres enlaces salían en 16px sin tracking y solo
                    "Más" —donde las dos clases van en la misma cadena— quedaba en
                    los 11px que corresponden. Acá no compite con nada. */}
                <span className="text-rotulo">{item.titulo}</span>
                {/* Como punto: un número acá desalinearía los iconos de la barra,
                    que es lo único que se toca con el pulgar en un celular. */}
                {item.insignia !== undefined && (
                  <Insignia valor={item.insignia} comoPunto className="right-3 top-0.5" />
                )}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex w-16 flex-col items-center justify-center gap-1 py-1 font-medium text-[var(--papel-60)]"
          >
            <Menu className="size-5" />
            <span className="text-rotulo">Más</span>
          </button>
        </nav>

        {/* ─────────────────────────────────────────────────────────────
            5. CONTENIDO PRINCIPAL
            ───────────────────────────────────────────────────────────── */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-20 tableta:px-8 sm:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
