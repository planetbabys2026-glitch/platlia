"use client";

import { useState } from "react";
import Link from "next/link";
import { Logotipo } from "@/components/marca/logo";
import { Button } from "@/components/ui/button";
import { Menu, X, Sparkles } from "lucide-react";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--linea-16)] bg-[var(--tinta)]/90 backdrop-blur-md transition-all">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
        {/* Branding */}
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-90">
          <Logotipo size="md" eyebrow="SISTEMA GASTRONÓMICO" />
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-mono uppercase tracking-wider text-[var(--linea)]">
          <Link href="/#virtudes" className="transition-colors hover:text-[var(--papel)]">
            Virtudes
          </Link>
          <Link href="/#precios" className="transition-colors hover:text-[var(--papel)]">
            Precios
          </Link>
          <Link href="/#preguntas" className="transition-colors hover:text-[var(--papel)]">
            Preguntas
          </Link>
          <Link href="/#contacto" className="transition-colors hover:text-[var(--papel)]">
            Contacto
          </Link>
        </nav>

        {/* Action Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="border-[var(--linea-30)] text-[var(--papel)] hover:bg-[var(--panel-2)] font-mono text-xs">
            <Link href="/ingresar">Ingresar</Link>
          </Button>
          <Button asChild size="sm" className="bg-[var(--brasa)] text-[var(--tinta)] hover:bg-[var(--brasa-hover)] font-bold shadow-sm font-mono text-xs">
            <Link href="/registro" className="flex items-center gap-1.5">
              <Sparkles className="size-3.5" />
              Prueba gratis 7 días
            </Link>
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-[var(--papel)] hover:bg-[var(--panel-2)] focus:outline-none"
          aria-label="Abrir menú de navegación"
        >
          {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[var(--linea-30)] bg-[var(--panel-bg)] px-6 py-6 space-y-4 shadow-xl">
          <nav className="flex flex-col gap-4 font-mono text-sm uppercase tracking-wider">
            <Link
              href="/#virtudes"
              onClick={() => setMobileMenuOpen(false)}
              className="text-[var(--linea)] hover:text-[var(--papel)] py-1"
            >
              Virtudes del sistema
            </Link>
            <Link
              href="/#precios"
              onClick={() => setMobileMenuOpen(false)}
              className="text-[var(--linea)] hover:text-[var(--papel)] py-1"
            >
              Planes y precios
            </Link>
            <Link
              href="/#preguntas"
              onClick={() => setMobileMenuOpen(false)}
              className="text-[var(--linea)] hover:text-[var(--papel)] py-1"
            >
              Preguntas frecuentes
            </Link>
            <Link
              href="/#contacto"
              onClick={() => setMobileMenuOpen(false)}
              className="text-[var(--linea)] hover:text-[var(--papel)] py-1"
            >
              Contacto comercial
            </Link>
          </nav>
          <div className="pt-4 border-t border-dashed border-[var(--linea-30)] flex flex-col gap-2.5">
            <Button asChild variant="outline" className="w-full justify-center border-[var(--linea-30)] text-[var(--papel)]">
              <Link href="/ingresar">Ingresar a mi cuenta</Link>
            </Button>
            <Button asChild className="w-full justify-center bg-[var(--brasa)] text-[var(--tinta)] font-bold">
              <Link href="/registro">Probar 7 días gratis</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
