import { Smile, TrendingUp, Zap, ShieldCheck } from "lucide-react";

export function EfficiencyManifesto() {
  return (
    <section className="py-20 lg:py-28 bg-[var(--panel-bg)] relative border-b border-dashed border-[var(--linea-30)] overflow-hidden">
      {/* Glow ambiental */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[600px] bg-[radial-gradient(circle,color-mix(in_oklch,var(--brasa)_10%,transparent)_0%,transparent_70%)] pointer-events-none" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Encabezado del Manifiesto */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--linea-30)] bg-[var(--panel-2)] text-xs font-mono tracking-widest text-[var(--brasa)] font-bold uppercase shadow-sm">
            <Zap className="size-3.5" />
            <span>NUESTRA FILOSOFÍA DE SERVICIO</span>
          </div>

          <h2 className="font-display font-black text-4xl sm:text-6xl uppercase tracking-tight text-[var(--papel)] leading-[0.92]">
            Cada segundo optimizado es felicidad para tu cliente <br />
            <span className="text-[var(--brasa)]">y mayor rentabilidad para tu negocio</span>
          </h2>

          <p className="text-[var(--linea)] text-base sm:text-lg leading-relaxed max-w-2xl mx-auto font-normal">
            En gastronomía, el tiempo no es solo un indicador operativo: es la diferencia entre un comensal encantado que regresa cada fin de semana y una mesa desaprovechada por demoras en comanda o cobro.
          </p>
        </div>

        {/* 3 Pilares de Impacto */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Pilar 1: Felicidad del Cliente */}
          <div className="rounded-2xl border border-[var(--linea-16)] bg-[var(--tinta)] p-8 flex flex-col justify-between hover:border-[var(--brasa)]/60 transition-all duration-300 group">
            <div className="space-y-4">
              <div className="size-14 rounded-2xl bg-[var(--panel-2)] border border-[var(--linea-30)] flex items-center justify-center text-[var(--brasa)] group-hover:scale-110 transition-transform">
                <Smile className="size-7" />
              </div>
              <span className="font-mono text-xs font-bold text-[var(--brasa)] tracking-wider uppercase block">
                — 01. EXPERIENCIA DEL COMENSAL
              </span>
              <h3 className="font-display font-black text-2xl uppercase tracking-tight text-[var(--papel)]">
                Cero esperas = Comensales felices
              </h3>
              <p className="text-[var(--linea)] text-sm leading-relaxed">
                La comanda viaja de la mesa a la pantalla de cocina (KDS) en <strong>0.2 segundos</strong>. El comensal recibe sus platos calientes y a tiempo, sin platos devueltos ni meseros buscando libretas de papel.
              </p>
            </div>

            <div className="mt-8 pt-4 border-t border-dashed border-[var(--linea-30)] font-mono text-xs text-[var(--papel)] flex items-center justify-between">
              <span>Tiempo de atención:</span>
              <span className="font-bold text-[var(--brasa)]">-45% de espera</span>
            </div>
          </div>

          {/* Pilar 2: Rotación de Mesas & Rentabilidad */}
          <div className="rounded-2xl border-2 border-[var(--brasa)] bg-[var(--panel-2)] p-8 flex flex-col justify-between shadow-2xl relative group scale-[1.02]">
            <div className="absolute -top-3.5 right-6 bg-[var(--brasa)] text-[var(--tinta)] font-mono text-rotulo font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-md">
              IMPACTO DIRECTO EN CAJA
            </div>

            <div className="space-y-4">
              <div className="size-14 rounded-2xl bg-[var(--tinta)] border border-[var(--brasa)]/40 flex items-center justify-center text-[var(--brasa)] group-hover:scale-110 transition-transform">
                <TrendingUp className="size-7" />
              </div>
              <span className="font-mono text-xs font-bold text-[var(--brasa)] tracking-wider uppercase block">
                — 02. EFICIENCIA FINANCIERA
              </span>
              <h3 className="font-display font-black text-2xl uppercase tracking-tight text-[var(--papel)]">
                Mayor rotación de mesas = Más dinero
              </h3>
              <p className="text-[var(--linea)] text-sm leading-relaxed">
                Ahorrar <strong>5 minutos por mesa</strong> en horas pico te permite liberar el salón más rápido y sentar hasta <strong>un turno adicional por noche</strong> los viernes y sábados con la misma cantidad de mesas.
              </p>
            </div>

            <div className="mt-8 pt-4 border-t border-dashed border-[var(--linea-30)] font-mono text-xs text-[var(--papel)] flex items-center justify-between">
              <span>Rotación en hora pico:</span>
              <span className="font-bold text-[var(--brasa)]">+28% facturación</span>
            </div>
          </div>

          {/* Pilar 3: Control y Cierre sin Errores */}
          <div className="rounded-2xl border border-[var(--linea-16)] bg-[var(--tinta)] p-8 flex flex-col justify-between hover:border-[var(--brasa)]/60 transition-all duration-300 group">
            <div className="space-y-4">
              <div className="size-14 rounded-2xl bg-[var(--panel-2)] border border-[var(--linea-30)] flex items-center justify-center text-[var(--brasa)] group-hover:scale-110 transition-transform">
                <ShieldCheck className="size-7" />
              </div>
              <span className="font-mono text-xs font-bold text-[var(--brasa)] tracking-wider uppercase block">
                — 03. CONTROL DE OPERACIÓN
              </span>
              <h3 className="font-display font-black text-2xl uppercase tracking-tight text-[var(--papel)]">
                Cuentas claras y arqueo en 1 clic
              </h3>
              <p className="text-[var(--linea)] text-sm leading-relaxed">
                Pre-cuenta para llevar a la mesa, desglose automático de <strong>Impoconsumo (8%)</strong> y propina sugerida (10%), y cierre Z con arqueo ciego. Tu equipo sale a tiempo y tu caja cuadra peso a peso.
              </p>
            </div>

            <div className="mt-8 pt-4 border-t border-dashed border-[var(--linea-30)] font-mono text-xs text-[var(--papel)] flex items-center justify-between">
              <span>Cierre de caja diario:</span>
              <span className="font-bold text-[var(--brasa)]">En 60 segundos</span>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
