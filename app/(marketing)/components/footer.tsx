import Link from "next/link";
import { Logo } from "@/components/marca/logo";
import { ShieldCheck, FileText, Phone, Mail } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-card border-t border-border pt-16 pb-12 text-card-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-border">
          
          {/* Logo y descripción de marca */}
          <div className="md:col-span-5 space-y-4">
            <Link href="/" className="inline-block">
              <Logo className="h-16 sm:h-20" />
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
              SaaS de gestión multi-tenant para bares y restaurantes. Control de salón, comandas digitales, caja, inventario e informes de negocio en tiempo real.
            </p>
            <div className="pt-2 text-xs text-muted-foreground">
              <span>Colombia 🇨🇴 · PLATLIA S.A.S.</span>
            </div>
          </div>

          {/* Navegación Rápida */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="font-semibold text-sm text-foreground uppercase tracking-wider">
              Platlia POS
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/#virtudes" className="hover:text-foreground transition-colors">
                  Virtudes del Sistema
                </Link>
              </li>
              <li>
                <Link href="/#precios" className="hover:text-foreground transition-colors">
                  Planes de Licencia
                </Link>
              </li>
              <li>
                <Link href="/registro" className="hover:text-foreground transition-colors text-brand-accent font-medium">
                  Prueba Gratis (7 Días)
                </Link>
              </li>
              <li>
                <Link href="/ingresar" className="hover:text-foreground transition-colors">
                  Ingresar a mi Cuenta
                </Link>
              </li>
            </ul>
          </div>

          {/* Enlaces Legales & Atención */}
          <div className="md:col-span-4 space-y-3">
            <h4 className="font-semibold text-sm text-foreground uppercase tracking-wider">
              Atención Legal & Consumidor
            </h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <Link href="/habeas-data" className="hover:text-foreground transition-colors flex items-center gap-2">
                  <ShieldCheck className="size-4 text-brand dark:text-[#3E9EA2]" />
                  <span>Política de Habeas Data (Ley 1581)</span>
                </Link>
              </li>
              <li>
                <Link href="/pqr" className="hover:text-foreground transition-colors flex items-center gap-2">
                  <FileText className="size-4 text-brand-accent" />
                  <span>Canal de Radicación de PQR</span>
                </Link>
              </li>
              <li className="pt-1 text-xs text-muted-foreground flex items-center gap-2">
                <Mail className="size-3.5 text-brand" />
                <span>Atención: <strong className="text-foreground">contacto@platlia.com</strong></span>
              </li>
              <li className="text-xs text-muted-foreground flex items-center gap-2">
                <Phone className="size-3.5 text-brand" />
                <span>Soporte: <strong className="text-foreground">+57 (300) 123-4567</strong></span>
              </li>
            </ul>
          </div>

        </div>

        {/* Pie de página inferior */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} Platlia S.A.S. Todos los derechos reservados.
          </p>
          <p className="flex items-center gap-1.5">
            <span>Desarrollado para la gastronomía de Colombia</span>
            <span>🇨🇴</span>
          </p>
        </div>

      </div>
    </footer>
  );
}
