import { 
  LayoutGrid, 
  ChefHat, 
  Receipt, 
  Boxes, 
  Clock, 
  Users2, 
  Check
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const VIRTUDES = [
  {
    icon: LayoutGrid,
    title: "Mapa de Salón y Mesas en Vivo",
    subtitle: "Visibilidad total del estado de tus clientes",
    description:
      "Visualiza al instante qué mesas están Libres, Ocupadas, con Cuenta Pedida o Reservadas. Controla los tiempos de ocupación y atiende solicitudes rápidamente.",
    highlights: ["Indicadores de estado por color", "Atención priorizada según tiempo", "Asignación rápida de meseros"],
    colorBadge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  {
    icon: ChefHat,
    title: "KDS y Pantalla de Cocina / Bar",
    subtitle: "Cero papelitos extraviados y comandas en orden",
    description:
      "Los pedidos tomados en la mesa viajan en tiempo real a las pantallas de cocina o bar. Organizado por tiempos de espera de verde a rojo para máxima eficiencia.",
    highlights: ["Sincronización instantánea", "Alertas visuales de retraso", "Modo turnero para llamar clientes"],
    colorBadge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  {
    icon: Receipt,
    title: "Caja y Tributación Colombiana",
    subtitle: "Facturación rápida con ICO 8%, IVA y Propina",
    description:
      "Genera tiquetes térmicos (55mm y 80mm) con desglose automático de Impuesto al Consumo (8%), IVA opcional y Sugerencia de Propina (10%). Arqueos de caja sin cuadres sorpresa.",
    highlights: ["Cierre y apertura por turnos", "Múltiples medios de pago", "Tiquetes imprimibles @page"],
    colorBadge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  {
    icon: Boxes,
    title: "Inventario y Costos por Receta",
    subtitle: "Descuento automático de stock en cada venta",
    description:
      "Vincula insumos a tus platos y bebidas. Platlia descuenta automáticamente el stock cada vez que se marca un ítem, alertándote antes de quedar desabastecido.",
    highlights: ["Cálculo del costo por plato", "Ficha técnica e ingredientes", "Alertas de stock mínimo"],
    colorBadge: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  },
  {
    icon: Clock,
    title: "Jornada Nocturna Real",
    subtitle: "Tu día de negocio no muere a medianoche",
    description:
      "Diseñado para bares y restaurantes: la jornada operativa inicia a la hora que tú configures (ej: 5:00 a.m.). Las ventas de la 2:00 a.m. pertenecen a la noche del viernes, no al sábado.",
    highlights: ["Reportes consolidados nocturnos", "Horario flexible configurable", "Informes de turnos precisos"],
    colorBadge: "bg-brand/10 text-brand border-brand/20 dark:text-[#3E9EA2]",
  },
  {
    icon: Users2,
    title: "Multiusuario y Sin Cobros Ocultos",
    subtitle: "Todo tu equipo conectado sin pagar extra",
    description:
      "Crea cuentas para todos tus meseros, cajeros, administradores y cocineros sin ningún costo adicional por usuario ni por pantalla conectada.",
    highlights: ["Roles y permisos detallados", "Registro de auditoría de acciones", "Acceso remoto desde cualquier lugar"],
    colorBadge: "bg-brand-accent/10 text-brand-accent border-brand-accent/20",
  },
];

export function Features() {
  return (
    <section id="virtudes" className="py-20 bg-background relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Encabezado de la sección */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <Badge variant="outline" className="border-brand/30 bg-brand/5 text-brand dark:text-[#3E9EA2] px-3 py-1 text-xs sm:text-sm font-medium">
            Virtudes del Sistema
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Diseñado para la realidad operativa de bares y restaurantes
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed text-pretty">
            Platlia combina la solidez de un sistema POS profesional con la agilidad que requiere el servicio en salón y cocina en Colombia.
          </p>
        </div>

        {/* Grilla de virtudes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {VIRTUDES.map((virtud, idx) => {
            const IconComponent = virtud.icon;
            return (
              <div
                key={idx}
                className="group relative rounded-2xl border border-border bg-card p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-brand/40 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="size-12 rounded-xl bg-muted/80 flex items-center justify-center text-foreground group-hover:scale-110 group-hover:bg-brand group-hover:text-brand-foreground transition-all duration-300">
                      <IconComponent className="size-6" />
                    </div>
                    <Badge variant="outline" className={`text-[11px] font-medium border ${virtud.colorBadge}`}>
                      Platlia SaaS
                    </Badge>
                  </div>

                  <h3 className="text-xl font-bold text-foreground mb-1 group-hover:text-brand dark:group-hover:text-[#3E9EA2] transition-colors">
                    {virtud.title}
                  </h3>
                  <p className="text-xs font-semibold text-brand-accent mb-3">
                    {virtud.subtitle}
                  </p>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                    {virtud.description}
                  </p>
                </div>

                {/* Viñetas destacadas */}
                <ul className="space-y-2 pt-4 border-t border-border/60 text-xs text-muted-foreground">
                  {virtud.highlights.map((h, hIdx) => (
                    <li key={hIdx} className="flex items-center gap-2">
                      <Check className="size-3.5 text-brand shrink-0 dark:text-[#3E9EA2]" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Banner de resumen operacional */}
        <div className="mt-16 rounded-2xl bg-gradient-to-r from-brand/10 via-brand-accent/10 to-brand/10 border border-brand/20 p-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-foreground">¿Tienes más de una sucursal o grupo gastronómico?</h3>
            <p className="text-muted-foreground text-sm">
              Platlia administra múltiples sucursales con consolas unificadas y reportes consolidados por negocio.
            </p>
          </div>
          <a
            href="#contacto"
            className="shrink-0 inline-flex items-center justify-center rounded-xl bg-brand px-6 py-3 text-sm font-medium text-brand-foreground shadow-sm hover:bg-brand/90 transition-colors"
          >
            Hablar con un asesor
          </a>
        </div>

      </div>
    </section>
  );
}
