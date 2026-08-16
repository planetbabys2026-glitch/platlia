"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bike,
  BookOpen,
  Boxes,
  Calculator,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutGrid,
  LogOut,
  Menu,
  MonitorPlay,
  Settings,
  SlidersHorizontal,
  Store,
  Users,
  X,
} from "lucide-react";
import { Isotipo, Logotipo } from "@/components/marca/logo";
import { Button } from "@/components/ui/button";
import { salir } from "@/features/auth/actions";
import { Campana } from "@/features/avisos/campana";
import { Insignia } from "@/features/avisos/insignia";
import { ProveedorAvisos, useAvisos } from "@/features/avisos/proveedor";
import { cn } from "@/lib/utils";

type AppShellProps = {
  user: { name: string; email?: string } | null;
  businessName?: string;
  role?: string | null;
  usaMesas: boolean;
  usaCocina?: boolean;
  usaDomicilios?: boolean;
  puedeVerInventario: boolean;
  /** Contadores calculados en el servidor, para que la primera pintura ya traiga el número. */
  cocinaInicial?: number;
  domiciliosInicial?: number;
  children: React.ReactNode;
};

type NavItem = {
  titulo: string;
  href: string;
  icono: React.ElementType;
  categoria: "OPERACION" | "GESTION";
  /** Cuántos pendientes tiene ese destino ahora mismo. */
  insignia?: number;
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
    >
      <Shell {...props} />
    </ProveedorAvisos>
  );
}

function Shell({
  user,
  businessName,
  usaMesas,
  usaCocina = true,
  usaDomicilios = true,
  puedeVerInventario,
  children,
}: AppShellProps) {
  const { cocina: comandasVivas, domicilios: domiciliosActivos } = useAvisos();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(pathname.startsWith("/administracion"));

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

  // Lista de elementos de navegación principal
  const operacionItems: NavItem[] = [
    ...(usaMesas
      ? [
          {
            titulo: "Salón",
            href: "/salon",
            icono: LayoutGrid,
            categoria: "OPERACION" as const,
          },
        ]
      : [
          {
            titulo: "POS",
            href: "/pos",
            icono: Calculator,
            categoria: "OPERACION" as const,
          },
        ]),
    // El módulo se puede apagar por empresa y la página responde 404: hasta
    // ahora el ítem se pintaba igual y llevaba a una pantalla que no existe.
    ...(usaCocina
      ? [
          {
            titulo: "Cocina",
            href: "/cocina",
            icono: ChefHat,
            categoria: "OPERACION" as const,
            insignia: comandasVivas,
          },
        ]
      : []),
    {
      titulo: "Caja",
      href: "/caja",
      icono: CreditCard,
      categoria: "OPERACION" as const,
    },
    ...(usaDomicilios
      ? [
          {
            titulo: "Domicilios",
            href: "/domicilios",
            icono: Bike,
            categoria: "OPERACION" as const,
            insignia: domiciliosActivos,
          },
        ]
      : []),
    {
      titulo: "Turnero",
      href: "/turnero",
      icono: MonitorPlay,
      categoria: "OPERACION" as const,
    },
  ];

  const gestionItems: NavItem[] = [
    ...(puedeVerInventario
      ? [
          {
            titulo: "Inventario",
            href: "/inventario",
            icono: Boxes,
            categoria: "GESTION" as const,
          },
        ]
      : []),
    {
      titulo: "Informes",
      href: "/informes",
      icono: BarChart3,
      categoria: "GESTION" as const,
    },
  ];

  // Subniveles de Administración en Acordeón
  const adminSubItems = [
    { titulo: "Carta", href: "/administracion/carta", icono: BookOpen },
    ...(usaMesas ? [{ titulo: "Salón", href: "/administracion/salon", icono: LayoutGrid }] : []),
    { titulo: "Equipo", href: "/administracion/equipo", icono: Users },
    { titulo: "Configuración", href: "/administracion/configuracion", icono: SlidersHorizontal },
  ];

  const esRutaActiva = (href: string) => {
    return pathname === href || pathname.startsWith(href + "/");
  };

  const esAdminActivo = pathname.startsWith("/administracion");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ─────────────────────────────────────────────────────────────
          1. BARRA LATERAL DESKTOP (md: flex) - Colapsable con Acordeón
          ───────────────────────────────────────────────────────────── */}
      <aside
        // Con nombre porque no es el único `<aside>` de la aplicación: la
        // pantalla de una cuenta tiene el suyo, y dos landmarks sin nombre son
        // indistinguibles tanto para un lector de pantalla como para una prueba.
        aria-label="Menú principal"
        className={cn(
          "hidden md:flex flex-col sticky top-0 h-screen border-r border-[var(--linea-16)] bg-[var(--tinta)] transition-all duration-300 z-30 shrink-0",
          collapsed ? "w-20" : "w-64",
        )}
      >
        {/* Header de la Barra Lateral */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-[var(--linea-16)]">
          <Link
            href="/panel"
            className="flex items-center gap-2 overflow-hidden focus:outline-none focus:ring-2 focus:ring-[var(--brasa)] rounded-lg p-1"
          >
            {collapsed ? (
              <Isotipo className="h-7 w-auto shrink-0" />
            ) : (
              <Logotipo size="sm" />
            )}
          </Link>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
            className="h-8 w-8 text-[var(--muted)] hover:text-[var(--papel)] hover:bg-[var(--panel-2)] shrink-0"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Lista de Navegación */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin">
          {/* Grupo: Operación */}
          <div className="space-y-1">
            {!collapsed && (
              <p className="px-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)] mb-2">
                — Operación
              </p>
            )}
            {operacionItems.map((item) => {
              const activo = esRutaActiva(item.href);
              const Icono = item.icono;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.titulo : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group relative",
                    activo
                      ? "bg-[var(--brasa)]/15 text-[var(--brasa)] font-bold"
                      : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--papel)]",
                  )}
                >
                  <Icono
                    className={cn(
                      "h-4.5 w-4.5 shrink-0 transition-transform group-hover:scale-110",
                      activo ? "text-[var(--brasa)]" : "text-[var(--muted)]",
                    )}
                  />
                  {!collapsed && <span className="truncate">{item.titulo}</span>}
                  {item.insignia !== undefined && (
                    <Insignia
                      valor={item.insignia}
                      comoPunto={collapsed}
                      // Con la barra expandida, la marca de "activo" ocupa el
                      // borde derecho: la pastilla se corre para no quedar debajo.
                      className={!collapsed && activo ? "mr-1.5" : undefined}
                    />
                  )}
                  {activo && (
                    <span className="absolute right-0 top-1.5 bottom-1.5 w-1 bg-[var(--brasa)] rounded-l-full" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Grupo: Gestión + Acordeón de Administración */}
          <div className="space-y-1">
            {!collapsed && (
              <p className="px-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)] mb-2">
                — Gestión
              </p>
            )}
            {gestionItems.map((item) => {
              const activo = esRutaActiva(item.href);
              const Icono = item.icono;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.titulo : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group relative",
                    activo
                      ? "bg-[var(--brasa)]/15 text-[var(--brasa)] font-bold"
                      : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--papel)]",
                  )}
                >
                  <Icono
                    className={cn(
                      "h-4.5 w-4.5 shrink-0 transition-transform group-hover:scale-110",
                      activo ? "text-[var(--brasa)]" : "text-[var(--muted)]",
                    )}
                  />
                  {!collapsed && <span className="truncate">{item.titulo}</span>}
                  {activo && (
                    <span className="absolute right-0 top-1.5 bottom-1.5 w-1 bg-[var(--brasa)] rounded-l-full" />
                  )}
                </Link>
              );
            })}

            {/* ─── ACORDEÓN DE ADMINISTRACIÓN ─────────────────────────────── */}
            <div className="space-y-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (collapsed) setCollapsed(false);
                  setAdminOpen(!adminOpen);
                }}
                title={collapsed ? "Administración" : undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group relative",
                  esAdminActivo
                    ? "bg-[var(--brasa)]/15 text-[var(--brasa)] font-bold"
                    : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--papel)]",
                )}
              >
                <div className="flex items-center gap-3 truncate">
                  <Settings
                    className={cn(
                      "h-4.5 w-4.5 shrink-0 transition-transform group-hover:scale-110",
                      esAdminActivo ? "text-[var(--brasa)]" : "text-[var(--muted)]",
                    )}
                  />
                  {!collapsed && <span className="truncate">Administración</span>}
                </div>
                {!collapsed && (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-200 text-[var(--muted)]",
                      adminOpen && "rotate-180",
                    )}
                  />
                )}
              </button>

              {/* Subniveles desplegables en Acordeón */}
              {adminOpen && !collapsed && (
                <div className="ml-4 pl-3 border-l border-dashed border-[var(--linea-30)] space-y-1 pt-1">
                  {adminSubItems.map((sub) => {
                    const SubIcono = sub.icono;
                    const activo = pathname === sub.href;

                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-all",
                          activo
                            ? "bg-[var(--brasa)] text-[var(--tinta)] font-bold shadow-sm"
                            : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--papel)]",
                        )}
                      >
                        <SubIcono className="h-3.5 w-3.5 shrink-0" />
                        <span>{sub.titulo}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </nav>

        {/* Footer de la Barra Lateral (Usuario, Cambiar Sucursal y Salir) */}
        <div className="border-t border-[var(--linea-16)] p-3 bg-[var(--panel-bg)] space-y-2">
          {!collapsed && businessName && (
            <Link
              href="/elegir-negocio"
              className="flex items-center justify-between p-2 rounded-lg bg-[var(--panel-2)] border border-[var(--linea-30)] hover:border-[var(--brasa)] transition-all text-xs"
              title="Cambiar de sucursal / Ver mis locales"
            >
              <div className="flex items-center gap-2 truncate">
                <Store className="size-3.5 text-[var(--brasa)] shrink-0" />
                <span className="font-bold text-[var(--papel)] truncate">{businessName}</span>
              </div>
              <span className="text-[10px] font-mono font-bold bg-[var(--brasa)]/15 text-[var(--brasa)] px-1.5 py-0.5 rounded shrink-0">
                CAMBIAR
              </span>
            </Link>
          )}

          <div className={cn("flex items-center gap-2", collapsed ? "justify-center" : "justify-between")}>
            {user && !collapsed && (
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--panel-2)] border border-[var(--linea-30)] text-[var(--papel)] font-mono font-bold text-xs uppercase">
                  {user.name.slice(0, 2)}
                </div>
                <div className="truncate text-xs">
                  <p className="font-semibold truncate text-[var(--papel)]">{user.name}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-1">
              <Campana />
              {collapsed && (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  title="Cambiar sucursal"
                  className="h-8 w-8 text-muted-foreground hover:text-brand"
                >
                  <Link href="/elegir-negocio">
                    <Store className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              <form action={salir}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  title="Cerrar sesión"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────────
          2. ENCABEZADO SUPERIOR PARA MÓVIL Y TABLET (< md)
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/95 backdrop-blur px-4 md:hidden">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú de navegación"
              className="h-9 w-9 text-foreground"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <Link href="/panel" className="flex items-center">
              <Logotipo className="h-6" />
            </Link>
          </div>

          <div className="flex items-center gap-1.5">
            <Campana />
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 text-[11px] px-2 gap-1 rounded-lg border-brand/40 text-brand dark:text-brand-accent font-bold"
              title="Cambiar sucursal"
            >
              <Link href="/elegir-negocio">
                <Store className="size-3.5" />
                <span className="max-w-[80px] truncate">{businessName || "Sucursales"}</span>
              </Link>
            </Button>
            <form action={salir}>
              <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </header>

        {/* ─────────────────────────────────────────────────────────────
            3. MENÚ DESPLEGABLE MÓVIL (DRAWER / OVERLAY)
            ───────────────────────────────────────────────────────────── */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            {/* Backdrop con desenfoque */}
            <div
              className="fixed inset-0 bg-neutral-950/60 backdrop-blur-sm transition-opacity"
              onClick={() => setMobileOpen(false)}
            />

            {/* Panel Deslizante */}
            <div className="relative flex w-4/5 max-w-xs flex-col bg-card shadow-2xl border-r border-border z-10 animate-in slide-in-from-left duration-200">
              <div className="flex h-16 items-center justify-between px-4 border-b border-border">
                <Logotipo className="h-7" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(false)}
                  className="h-9 w-9 text-muted-foreground"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <nav className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Operación */}
                <div className="space-y-1">
                  <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Operación
                  </p>
                  {operacionItems.map((item) => {
                    const activo = esRutaActiva(item.href);
                    const Icono = item.icono;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3.5 rounded-lg px-3.5 py-3 text-base font-medium transition-colors",
                          activo
                            ? "bg-[var(--brasa)]/15 text-[var(--brasa)] font-bold"
                            : "text-[var(--papel)] hover:bg-[var(--panel-2)]",
                        )}
                      >
                        <Icono
                          className={cn(
                            "h-5 w-5 shrink-0",
                            activo ? "text-[var(--brasa)]" : "text-[var(--muted)]",
                          )}
                        />
                        <span>{item.titulo}</span>
                        {item.insignia !== undefined && <Insignia valor={item.insignia} />}
                      </Link>
                    );
                  })}
                </div>

                {/* Gestión + Administración Acordeón */}
                <div className="space-y-1">
                  <p className="px-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)] mb-2">
                    — Gestión
                  </p>
                  {gestionItems.map((item) => {
                    const activo = esRutaActiva(item.href);
                    const Icono = item.icono;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3.5 rounded-lg px-3.5 py-3 text-base font-medium transition-colors",
                          activo
                            ? "bg-[var(--brasa)]/15 text-[var(--brasa)] font-bold"
                            : "text-[var(--papel)] hover:bg-[var(--panel-2)]",
                        )}
                      >
                        <Icono
                          className={cn(
                            "h-5 w-5 shrink-0",
                            activo ? "text-[var(--brasa)]" : "text-[var(--muted)]",
                          )}
                        />
                        <span>{item.titulo}</span>
                      </Link>
                    );
                  })}

                  {/* Acordeón Móvil de Administración */}
                  <div className="space-y-1 pt-2">
                    <div className="px-3 text-sm font-bold text-[var(--papel)] flex items-center gap-2 mb-1">
                      <Settings className="h-4 w-4 text-[var(--brasa)]" />
                      <span>Administración</span>
                    </div>
                    <div className="ml-3 pl-3 border-l border-dashed border-[var(--linea-30)] space-y-1">
                      {adminSubItems.map((sub) => {
                        const SubIcono = sub.icono;
                        const activo = pathname === sub.href;

                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                              activo
                                ? "bg-[var(--brasa)] text-[var(--tinta)] font-bold"
                                : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--papel)]",
                            )}
                          >
                            <SubIcono className="h-4 w-4 shrink-0" />
                            <span>{sub.titulo}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </nav>

              <div className="border-t border-border p-4 bg-muted/20 space-y-3">
                {user && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-brand font-bold text-sm uppercase border border-brand/30">
                      {user.name.slice(0, 2)}
                    </div>
                    <div className="truncate text-xs">
                      <p className="font-semibold text-foreground truncate">{user.name}</p>
                      {businessName && (
                        <p className="text-muted-foreground truncate">{businessName}</p>
                      )}
                    </div>
                  </div>
                )}

                <form action={salir}>
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full justify-start gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                  </Button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            4. BARRA RÁPIDA INFERIOR PARA TELÉFONOS (Mobile Bottom Bar)
            ───────────────────────────────────────────────────────────── */}
        <nav className="fixed bottom-0 inset-x-0 z-40 flex h-16 items-center justify-around border-t border-border bg-card/95 backdrop-blur px-2 md:hidden">
          {usaMesas ? (
            <Link
              href="/salon"
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors w-16 py-1",
                esRutaActiva("/salon") ? "text-brand font-bold" : "text-muted-foreground",
              )}
            >
              <LayoutGrid className="h-5 w-5" />
              <span>Salón</span>
            </Link>
          ) : (
            <Link
              href="/pos"
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors w-16 py-1",
                esRutaActiva("/pos") ? "text-brand font-bold" : "text-muted-foreground",
              )}
            >
              <Calculator className="h-5 w-5" />
              <span>POS</span>
            </Link>
          )}

          {usaCocina && (
            <Link
              href="/cocina"
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors w-16 py-1",
                esRutaActiva("/cocina") ? "text-brand font-bold" : "text-muted-foreground",
              )}
            >
              <ChefHat className="h-5 w-5" />
              <span>Cocina</span>
              {/* Como punto: un número acá desalinearía los cuatro iconos de la
                  barra, que es lo único que se toca con el pulgar en un celular. */}
              <Insignia valor={comandasVivas} comoPunto className="right-3 top-0.5" />
            </Link>
          )}

          <Link
            href="/caja"
            className={cn(
              "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors w-16 py-1",
              esRutaActiva("/caja") ? "text-brand font-bold" : "text-muted-foreground",
            )}
          >
            <CreditCard className="h-5 w-5" />
            <span>Caja</span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground w-16 py-1"
          >
            <Menu className="h-5 w-5" />
            <span>Más</span>
          </button>
        </nav>

        {/* ─────────────────────────────────────────────────────────────
            5. CONTENIDO PRINCIPAL DE LA PÁGINA
            ───────────────────────────────────────────────────────────── */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 md:px-8 pb-20 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
