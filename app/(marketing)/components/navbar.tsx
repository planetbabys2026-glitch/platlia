"use client";

import { useState } from "react";
import Link from "next/link";
import { Logotipo } from "@/components/marca/logo";
import { Button } from "@/components/ui/button";
import { Menu, X, Sparkles } from "lucide-react";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/85 backdrop-blur-md transition-all">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
        {/* Branding */}
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-90">
          <Logotipo priority className="h-8 sm:h-9" />
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <Link href="/#virtudes" className="transition-colors hover:text-foreground">
            Virtudes
          </Link>
          <Link href="/#precios" className="transition-colors hover:text-foreground">
            Precios
          </Link>
          <Link href="/#contacto" className="transition-colors hover:text-foreground">
            Contacto
          </Link>
        </nav>

        {/* Action Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/ingresar">Ingresar</Link>
          </Button>
          <Button asChild size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90 font-medium">
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
          className="md:hidden p-2 rounded-lg text-foreground hover:bg-muted focus:outline-none"
          aria-label="Abrir menú de navegación"
        >
          {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-background px-6 py-6 space-y-4 shadow-xl">
          <nav className="flex flex-col gap-4 text-base font-medium">
            <Link
              href="/#virtudes"
              onClick={() => setMobileMenuOpen(false)}
              className="text-muted-foreground hover:text-foreground py-1"
            >
              Virtudes del sistema
            </Link>
            <Link
              href="/#precios"
              onClick={() => setMobileMenuOpen(false)}
              className="text-muted-foreground hover:text-foreground py-1"
            >
              Planes y precios
            </Link>
            <Link
              href="/#contacto"
              onClick={() => setMobileMenuOpen(false)}
              className="text-muted-foreground hover:text-foreground py-1"
            >
              Contacto comercial
            </Link>
          </nav>
          <div className="pt-4 border-t border-border flex flex-col gap-2.5">
            <Button asChild variant="outline" className="w-full justify-center">
              <Link href="/ingresar">Ingresar a mi cuenta</Link>
            </Button>
            <Button asChild className="w-full justify-center bg-brand text-brand-foreground hover:bg-brand/90">
              <Link href="/registro">Probar 7 días gratis</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
