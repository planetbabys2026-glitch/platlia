"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
import { cn } from "@/lib/utils";
import {
  construirNavegacion,
  esRutaActiva,
  hrefDeSeccion,
  itemsDeBarraInferior,
  type ItemNav,
} from "./navegacion";

type AppShellProps = {
  user: { name: string; email?: string } | null;
  businessName?: string;
  role?: string | null;
  usaMesas: boolean;
  usaCocina?: boolean;
  usaDomicilios?: boolean;
  puedeVerInventario: boolean;
  usaRecetas?: boolean;
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
 * Un ítem del menú, uno solo para los dos menús.
 *
 * `denso` es la barra de escritorio; el cajón usa el tamaño táctil, que es el que
 * fija el manual: 44px de alto, porque abajo de 1020px esto se toca con el dedo.
 */
function EnlaceNav({
  item,
  activo,
  colapsado,
  denso,
  onNavegar,
  vistaActual,
  abierta,
  onAlternar,
}: {
  item: ItemNav;
  activo: boolean;
  colapsado?: boolean;
  denso?: boolean;
  onNavegar?: () => void;
  /** El `?vista=` de la URL, para marcar la sección abierta. */
  vistaActual?: string;
  /** Si el acordeón de secciones está desplegado. */
  abierta?: boolean;
  onAlternar?: () => void;
}) {
  const Icono = item.icono;
  const idPanel = useId();
  // Colapsada la barra no hay dónde poner las secciones: 80px no alcanzan ni
  // para el rótulo más corto.
  const secciones = colapsado ? undefined : item.secciones;

  const fila = (
    <div
      className={cn(
        "group relative flex items-center rounded-lg transition-colors",
        activo ? "bg-brand/15" : "hover:bg-[var(--panel-2)]",
      )}
    >
      {/* El riel del export: 3px de Brasa contra el borde izquierdo. Marca la
          posición sin depender del color del texto, que es lo que se pierde de
          reojo, y del lado por donde se leen los ítems. */}
      {activo ? (
        <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand" />
      ) : null}

      <Link
        href={item.href}
        onClick={onNavegar}
        title={colapsado ? item.titulo : undefined}
        aria-current={activo ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-center font-medium transition-colors",
          denso ? "gap-3 px-3 py-2.5 text-sm" : "min-h-11 gap-3.5 px-3.5 py-2.5 text-base",
          colapsado && "justify-center px-0",
          activo ? "font-bold text-brand" : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        <Icono
          className={cn("size-[18px] shrink-0", activo ? "text-brand" : "text-muted-foreground")}
        />
        {!colapsado && <span className="truncate">{item.titulo}</span>}
        {item.insignia !== undefined && <Insignia valor={item.insignia} comoPunto={colapsado} />}
      </Link>

      {/* La flecha es un botón aparte y no parte del enlace: un `<button>` dentro
          de un `<a>` es HTML inválido, y además plegar no es navegar. */}
      {secciones && (
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierta}
          aria-controls={idPanel}
          aria-label={`${abierta ? "Plegar" : "Desplegar"} ${item.titulo}`}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
            denso ? "px-2 py-2.5" : "min-h-11 px-3",
          )}
        >
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform duration-200", abierta && "rotate-180")}
          />
        </button>
      )}
    </div>
  );

  if (!secciones) return fila;

  return (
    <div>
      {fila}
      <div
        id={idPanel}
        // `inert` y no `hidden`: `display:none` cortaría la animación en seco.
        inert={!abierta}
        aria-hidden={!abierta}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          abierta ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        {/* `min-h-0` es lo que deja que la fila del grid llegue a 0fr. */}
        <div className="min-h-0 overflow-hidden">
          <div className="ml-4 mt-1 space-y-0.5 border-l border-dashed border-[var(--linea-30)] pl-3">
            {secciones.map((seccion) => {
              const activaSeccion = activo && (vistaActual ?? "") === seccion.vista;
              return (
                <Link
                  key={seccion.vista || "principal"}
                  href={hrefDeSeccion(item, seccion)}
                  onClick={onNavegar}
                  aria-current={activaSeccion ? "page" : undefined}
                  className={cn(
                    "flex items-center rounded-md font-medium transition-colors",
                    denso ? "px-3 py-2 text-xs" : "min-h-11 px-3 py-2 text-sm",
                    activaSeccion
                      ? "bg-brand font-bold text-brand-foreground"
                      : "text-muted-foreground hover:bg-[var(--panel-2)] hover:text-foreground",
                  )}
                >
                  <span className="truncate">{seccion.titulo}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
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
  usaMesas,
  usaCocina = true,
  usaDomicilios = true,
  puedeVerInventario,
  usaRecetas,
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(pathname.startsWith("/administracion"));
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

  // Cargar estado colapsado guardado en localStorage
  useEffect(() => {
    try {
      const guardado = localStorage.getItem("platlia_sidebar_collapsed");
      if (guardado !== null) {
        setCollapsed(guardado === "true");
      }
    } catch {
      // Ignorar errores de acceso a localStorage en privado
    }
  }, []);

  // Abrir acordeón automáticamente si la ruta activa es de administración
  useEffect(() => {
    if (pathname.startsWith("/administracion")) {
      setAdminOpen(true);
    }
  }, [pathname]);

  const toggleCollapsed = () => {
    const nuevo = !collapsed;
    setCollapsed(nuevo);
    try {
      localStorage.setItem("platlia_sidebar_collapsed", String(nuevo));
    } catch {}
  };

  // Cerrar menú móvil al navegar a una nueva ruta
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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

  const { grupos, administracion } = construirNavegacion({
    usaMesas,
    usaCocina,
    usaDomicilios,
    puedeVerInventario,
    usaRecetas,
    puedeFacturar,
    esPropietario,
    comandasVivas,
    domiciliosActivos,
    cuentasPorCobrar,
  });
  const barraInferior = itemsDeBarraInferior(grupos);
  const esAdminActivo = pathname.startsWith("/administracion");

  const acordeonAdmin = (denso: boolean) => (
    <div className="space-y-1 pt-1">
      <button
        type="button"
        onClick={() => {
          if (collapsed) setCollapsed(false);
          setAdminOpen(!adminOpen);
        }}
        title={collapsed && denso ? "Administración" : undefined}
        aria-expanded={adminOpen}
        aria-controls={`admin-${denso ? "barra" : "cajon"}`}
        className={cn(
          "group relative flex w-full items-center justify-between rounded-lg font-medium transition-colors",
          denso ? "gap-3 px-3 py-2.5 text-sm" : "min-h-11 gap-3.5 px-3.5 py-2.5 text-base",
          esAdminActivo
            ? "bg-brand/15 font-bold text-brand"
            : "text-muted-foreground hover:bg-[var(--panel-2)] hover:text-foreground",
        )}
      >
        <span className="flex items-center gap-3 truncate">
          <Settings
            className={cn(
              "size-[18px] shrink-0",
              esAdminActivo ? "text-brand" : "text-muted-foreground",
            )}
          />
          {!(collapsed && denso) && <span className="truncate">Administración</span>}
        </span>
        {!(collapsed && denso) && (
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              adminOpen && "rotate-180",
            )}
          />
        )}
      </button>

      {!(collapsed && denso) && (
        <div
          id={`admin-${denso ? "barra" : "cajon"}`}
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
            <div className="ml-4 space-y-1 border-l border-dashed border-[var(--linea-30)] pl-3 pt-1">
              {administracion.map((sub) => {
                const SubIcono = sub.icono;
                const activo = pathname === sub.href;

                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    onClick={denso ? undefined : () => setMobileOpen(false)}
                    aria-current={activo ? "page" : undefined}
                    className={cn(
                      "flex items-center rounded-md font-medium transition-colors",
                      denso ? "gap-2.5 px-3 py-2 text-xs" : "min-h-11 gap-3 px-3 py-2 text-sm",
                      activo
                        ? "bg-brand font-bold text-brand-foreground"
                        : "text-muted-foreground hover:bg-[var(--panel-2)] hover:text-foreground",
                    )}
                  >
                    <SubIcono className="size-4 shrink-0" />
                    <span>{sub.titulo}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ─────────────────────────────────────────────────────────────
          1. BARRA LATERAL (tableta: 1020px en adelante)
          El punto de corte es el del export, no el `md` de Tailwind: con `md`
          (768px) una tablet vertical de 820px se comía 256px de barra y dejaba
          el área de trabajo en ~564px, que es lo peor de los dos mundos.
          ───────────────────────────────────────────────────────────── */}
      <aside
        // Con nombre porque no es el único `<aside>` de la aplicación: la
        // pantalla de una cuenta tiene el suyo, y dos landmarks sin nombre son
        // indistinguibles tanto para un lector de pantalla como para una prueba.
        aria-label="Menú principal"
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-[var(--linea-16)] bg-[var(--tinta)] transition-[width] duration-300 tableta:flex",
          collapsed ? "w-20" : "w-60",
        )}
      >
        {/* Colapsada, el logo y el botón se apilan. En fila no entraban: 80px de
            ancho menos 32px de padding dejan 48px para un isotipo de 28 y un
            botón de 36, así que uno de los dos se salía del borde. */}
        <div
          className={cn(
            "flex shrink-0 border-b border-dashed border-[var(--linea-16)]",
            collapsed
              ? "flex-col items-center gap-1 px-2 py-3"
              : "h-16 items-center justify-between px-4",
          )}
        >
          <Link
            href="/panel"
            className="flex items-center gap-2 overflow-hidden rounded-lg p-1 focus:outline-none focus:ring-2 focus:ring-brand"
            title={collapsed ? "Ir al panel" : undefined}
          >
            {collapsed ? <Isotipo className="h-7 w-auto shrink-0" /> : <Logotipo size="sm" />}
          </Link>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={toggleCollapsed}
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            className="shrink-0 text-muted-foreground hover:bg-[var(--panel-2)] hover:text-foreground"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </Button>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {grupos.map((grupo) => (
            <div key={grupo.titulo} className="space-y-1">
              {!collapsed && <RotuloGrupo>{grupo.titulo}</RotuloGrupo>}
              {grupo.items.map((item) => {
                const activo = esRutaActiva(pathname, item.href);
                const abierta = seccionesAbiertas[item.href] ?? activo;
                return (
                  <EnlaceNav
                    key={item.href}
                    item={item}
                    activo={activo}
                    colapsado={collapsed}
                    denso
                    vistaActual={vistaActual}
                    abierta={abierta}
                    onAlternar={() => alternarSecciones(item.href, abierta)}
                  />
                );
              })}
              {grupo.conAdministracion ? acordeonAdmin(true) : null}
            </div>
          ))}
        </nav>

        <div className="shrink-0 space-y-2 border-t border-dashed border-[var(--linea-16)] bg-[var(--panel-bg)] p-3">
          {!collapsed && businessName && (
            <Link
              href="/elegir-negocio"
              className="flex items-center justify-between rounded-lg border border-[var(--linea-16)] bg-[var(--panel)] p-2 text-xs transition-colors hover:border-brand"
              title="Cambiar de sucursal / Ver mis locales"
            >
              <span className="flex items-center gap-2 truncate">
                <Store className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-bold text-foreground">{businessName}</span>
              </span>
              <span className="shrink-0 rounded bg-brand/15 px-1.5 py-0.5 font-mono text-rotulo font-bold text-brand">
                CAMBIAR
              </span>
            </Link>
          )}

          {/* Colapsado los tres botones se apilan. En fila sumaban ~110px dentro
              de los 56px útiles que deja una barra de 80px, así que se salían por
              el costado y el último quedaba cortado contra el borde. */}
          <div
            className={cn(
              "flex gap-2",
              collapsed ? "flex-col items-center" : "items-center justify-between",
            )}
          >
            {user && !collapsed && (
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--linea-30)] bg-[var(--panel-3)] font-mono text-xs font-bold uppercase text-foreground">
                  {user.name.slice(0, 2)}
                </div>
                <p className="truncate text-xs font-semibold text-foreground">{user.name}</p>
              </div>
            )}

            <div className={cn("flex gap-1", collapsed ? "flex-col items-center" : "items-center")}>
              <Campana />
              {collapsed && (
                <Button
                  asChild
                  variant="ghost"
                  size="icon-sm"
                  title="Cambiar sucursal"
                  aria-label="Cambiar sucursal"
                  className="text-muted-foreground hover:text-brand"
                >
                  <Link href="/elegir-negocio">
                    <Store className="size-4" />
                  </Link>
                </Button>
              )}
              <form action={salir}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive-soft"
                >
                  <LogOut className="size-4" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ─────────────────────────────────────────────────────────────
            2. BARRA SUPERIOR PARA TELÉFONO Y TABLET (< 1020px)
            ───────────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-dashed border-[var(--linea-30)] bg-[color-mix(in_oklch,var(--tinta)_88%,transparent)] px-4 backdrop-blur tableta:hidden">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú de navegación"
              aria-expanded={mobileOpen}
              className="text-foreground"
            >
              <Menu className="size-5" />
            </Button>

            {/* `min-h-11` en el enlace del logo: es un destino más del menú y en el
                teléfono se toca con el pulgar como cualquier otro. */}
            <Link href="/panel" className="flex min-h-11 items-center">
              <Logotipo size="sm" />
            </Link>
          </div>

          <div className="flex items-center gap-1.5">
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

            <div className="animate-in slide-in-from-left relative z-10 flex w-[min(300px,86vw)] flex-col border-r border-[var(--linea-16)] bg-[var(--tinta)] shadow-2xl duration-200">
              <div className="flex h-16 items-center justify-between border-b border-dashed border-[var(--linea-16)] px-4">
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
                    {grupo.conAdministracion ? acordeonAdmin(false) : null}
                  </div>
                ))}
              </nav>

              <div className="space-y-3 border-t border-dashed border-[var(--linea-30)] bg-[var(--panel-bg)] p-4">
                {user && (
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full border border-[var(--linea-30)] bg-[var(--panel-3)] text-sm font-bold uppercase text-foreground">
                      {user.name.slice(0, 2)}
                    </div>
                    <div className="truncate text-xs">
                      <p className="truncate font-semibold text-foreground">{user.name}</p>
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
          className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-[var(--linea-16)] bg-[color-mix(in_oklch,var(--tinta)_92%,transparent)] px-2 backdrop-blur sm:hidden"
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
                  "relative flex w-16 flex-col items-center justify-center gap-1 py-1 text-rotulo font-medium transition-colors",
                  activo ? "font-bold text-brand" : "text-muted-foreground",
                )}
              >
                <Icono className="size-5" />
                <span>{item.titulo}</span>
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
            className="flex w-16 flex-col items-center justify-center gap-1 py-1 text-rotulo font-medium text-muted-foreground"
          >
            <Menu className="size-5" />
            <span>Más</span>
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
