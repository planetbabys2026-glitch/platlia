import Link from "next/link";
import { CORREO_SOPORTE, WHATSAPP_SOPORTE_VISIBLE } from "@/lib/soporte";
import { Logotipo } from "@/components/marca/logo";
import { ShieldCheck, FileText, Phone, Mail } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-[var(--tinta)] border-t border-dashed border-[var(--linea-30)] pt-16 pb-12 text-[var(--papel)] relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-dashed border-[var(--linea-30)]">
          
          {/* Logo y descripción de marca */}
          <div className="md:col-span-5 space-y-4">
            <Link href="/" className="inline-block">
              <Logotipo size="lg" eyebrow="SISTEMA GASTRONÓMICO" />
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
              SaaS de gestión multi-tenant para bares y restaurantes. Control de salón, comandas digitales, caja, inventario e informes de negocio en tiempo real.
            </p>
            <div className="pt-2 font-mono text-xs text-[var(--linea-55)] tracking-wider">
              <span>COLOMBIA 🇨🇴 · PLATLIA S.A.S.</span>
            </div>
          </div>

          {/* Navegación Rápida */}
          <div className="md:col-span-3 space-y-3">
            <h3 className="font-display font-black text-lg text-[var(--papel)] uppercase tracking-tight">
              Platlia POS
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/#virtudes" className="hover:text-[var(--papel)] transition-colors">
                  Virtudes del Sistema
                </Link>
              </li>
              <li>
                <Link href="/software-para-restaurantes" className="hover:text-[var(--papel)] transition-colors">
                  Software para Restaurantes
                </Link>
              </li>
              <li>
                <Link href="/software-para-bares" className="hover:text-[var(--papel)] transition-colors">
                  Software para Bares
                </Link>
              </li>
              <li>
                <Link href="/precios" className="hover:text-[var(--papel)] transition-colors">
                  Planes de Licencia (COP)
                </Link>
              </li>
              <li>
                <Link href="/guias" className="hover:text-[var(--papel)] transition-colors">
                  Guías para tu Negocio
                </Link>
              </li>
              <li>
                <Link href="/registro" className="hover:text-[var(--papel)] transition-colors text-[var(--brasa)] font-bold">
                  Prueba Gratis (7 Días)
                </Link>
              </li>
              <li>
                <Link href="/ingresar" className="hover:text-[var(--papel)] transition-colors">
                  Ingresar a mi Cuenta
                </Link>
              </li>
            </ul>
          </div>

          {/* Enlaces Legales & Atención */}
          <div className="md:col-span-4 space-y-3">
            <h3 className="font-display font-black text-lg text-[var(--papel)] uppercase tracking-tight">
              Atención & Marco Legal
            </h3>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <Link href="/habeas-data" className="hover:text-[var(--papel)] transition-colors flex items-center gap-2">
                  <ShieldCheck className="size-4 text-[var(--brasa)]" />
                  <span>Política de Habeas Data (Ley 1581)</span>
                </Link>
              </li>
              <li>
                <Link href="/pqr" className="hover:text-[var(--papel)] transition-colors flex items-center gap-2">
                  <FileText className="size-4 text-[var(--papel)]" />
                  <span>Canal de Radicación de PQR</span>
                </Link>
              </li>
              <li className="pt-1 font-mono text-xs text-muted-foreground flex items-center gap-2">
                <Mail className="size-3.5 text-[var(--brasa)]" />
                <span>Atención: <strong className="text-[var(--papel)] font-sans">{CORREO_SOPORTE}</strong></span>
              </li>
              <li className="font-mono text-xs text-muted-foreground flex items-center gap-2">
                <Phone className="size-3.5 text-[var(--brasa)]" />
                <span>WhatsApp: <strong className="text-[var(--papel)] font-sans">{WHATSAPP_SOPORTE_VISIBLE}</strong></span>
              </li>
            </ul>
          </div>

        </div>

        {/* Pie de página inferior */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-[var(--linea-55)] tracking-wider">
          <p>
            © {new Date().getFullYear()} PLATLIA S.A.S. TODOS LOS DERECHOS RESERVADOS.
          </p>
          <p className="flex items-center gap-1.5">
            <span>HECHO PARA LA GASTRONOMÍA DE COLOMBIA</span>
            <span>🇨🇴</span>
          </p>
        </div>

      </div>

      {/* Marca de agua gigante de fondo PLATLIA */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none absolute -bottom-10 left-1/2 -translate-x-1/2 font-display font-black text-[clamp(100px,18vw,260px)] uppercase leading-none tracking-tighter text-[var(--papel)]/[0.025] whitespace-nowrap"
      >
        PLATLIA
      </div>
    </footer>
  );
}
