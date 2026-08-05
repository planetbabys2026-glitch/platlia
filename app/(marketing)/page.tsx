import Link from "next/link";
import { Logo } from "@/components/marca/logo";
import { Button } from "@/components/ui/button";

// Los estados reales del salón. Aparecen acá porque son la interfaz que el
// dueño va a mirar todo el día: la portada muestra el producto, no una metáfora.
const ESTADOS_MESA = [
  { nombre: "Libre", clase: "bg-mesa-libre" },
  { nombre: "Ocupada", clase: "bg-mesa-ocupada" },
  { nombre: "Cuenta pedida", clase: "bg-mesa-cuenta" },
  { nombre: "Reservada", clase: "bg-mesa-reservada" },
] as const;

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-12 px-6 py-16">
      <div className="max-w-2xl space-y-5 text-center">
        {/* Con bajada y a este tamaño: por debajo de ~80px la línea "Gestión de
            Restaurantes y Bares" deja de leerse y sobra. */}
        <Logo priority className="mx-auto h-20 sm:h-28" />
        <h1 className="text-4xl leading-[1.05] font-semibold text-balance sm:text-6xl">
          Tu restaurante, ordenado de principio a fin
        </h1>
        <p className="text-muted-foreground mx-auto max-w-xl text-lg text-pretty">
          Mesas, pedidos, cocina, caja e informes en un solo lugar. Sin límite de
          usuarios, mesas ni módulos.
        </p>
      </div>

      {/* La cifra es la firma del producto: acá todo es un número —mesa 12,
          turno 47, $18.900— y el precio es el primero que importa. */}
      <div className="border-border bg-card flex flex-col items-center gap-1 rounded-xl border px-10 py-8">
        <div className="flex items-start gap-1">
          <span className="text-muted-foreground mt-2 text-xl">$</span>
          <span className="numeral text-6xl leading-none font-semibold sm:text-7xl">
            50.000
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          al mes por negocio · 1 sucursal incluida
        </p>
        {/* La terracota es el segundo color de marca y acá tiene su lugar: la
            línea que empuja a probar el producto. */}
        <p className="text-brand-accent text-sm font-medium">
          Los primeros 7 días son gratis
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/registro">Empezar prueba gratis</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/ingresar">Ingresar</Link>
        </Button>
      </div>

      <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        {ESTADOS_MESA.map((estado) => (
          <li
            key={estado.nombre}
            className="text-muted-foreground flex items-center gap-2 text-sm"
          >
            <span
              aria-hidden
              className={`size-2.5 rounded-full ${estado.clase}`}
            />
            {estado.nombre}
          </li>
        ))}
      </ul>
    </main>
  );
}
