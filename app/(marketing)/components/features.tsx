import {
  QrCode,
  Bike,
  Receipt,
  ChefHat,
  Boxes,
  Clock,
  Check,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const VIRTUDES = [
  {
    icon: QrCode,
    title: "Menú Digital QR Personalizable",
    subtitle: "Autopedidos en mesas y domicilios con tu marca",
    description:
      "Genera códigos QR imprimibles para cada mesa o para domicilios. El cliente escanea desde su celular, ve tu menú con fotos reales de inventario y envía su pedido directamente a cocina.",
    highlights: [
      "Fondo sólido, degradado o imagen de Cloudinary",
      "Autopedidos asignados a la mesa automáticamente",
      "Tarjetas QR listas para imprimir",
    ],
    colorBadge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  {
    icon: Bike,
    title: "Módulo de Domicilios & Trazabilidad SSE",
    subtitle: "Rastreo en vivo para clientes y facturación propia",
    description:
      "Gestiona tus entregas a domicilio con datos completos del cliente (Celular, Dirección, Documento). Los clientes rastrean su pedido en tiempo real vía Redis SSE y los cajeros facturan sin salir del panel.",
    highlights: [
      "Trazabilidad en vivo por celular o N° pedido",
      "Contacto directo con cliente por WhatsApp",
      "Facturación e impresión integrada",
    ],
    colorBadge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  {
    icon: Receipt,
    title: "Caja Dividida en 2 Módulos Especializados",
    subtitle: "Cobros rápidos y control estricto de dinero",
    description:
      "Estructurado en 2 áreas independientes: Módulo 1 para cobrar cuentas de salón/POS con ICO (8%), IVA y Propina; Módulo 2 para entradas, salidas, retiros, ajustes y cierre de turno.",
    highlights: [
      "Módulo 1: Cobro de Cuentas y Salón / POS",
      "Módulo 2: Entradas, Egresos y Arqueo de Caja",
      "Tiquetes térmicos imprimibles (55mm y 80mm)",
    ],
    colorBadge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  {
    icon: ChefHat,
    title: "Comandas a Cocina & Turnero TV",
    subtitle: "Cero papelitos perdidos y notas congeladas",
    description:
      "Las comandas viajan al instante a las pantallas KDS de cocina o bar incluyendo las observaciones específicas del cliente ('Sin cebolla', 'Término medio'). Notifica en pantalla TV cuando esté listo.",
    highlights: [
      "Notas de pedido congeladas en cada renglón",
      "Tiempos de espera por color (Verde ➔ Rojo)",
      "Modo Turnero TV para llamar a clientes",
    ],
    colorBadge: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  },
  {
    icon: Boxes,
    title: "Inventario y Costos por Receta",
    subtitle: "Descuento automático de stock por venta",
    description:
      "Vincula insumos e ingredientes a tus platos y bebidas. Platlia descuenta automáticamente el inventario cada vez que se vende una comanda, alertándote antes de quedar desabastecido.",
    highlights: [
      "Ficha técnica por plato y costo exacto",
      "Alertas automáticas de stock mínimo",
      "Control de proveedores y compras",
    ],
    colorBadge: "bg-brand/10 text-brand border-brand/20 dark:text-[#3E9EA2]",
  },
  {
    icon: Clock,
    title: "Jornada Nocturna Real (5:00 a.m.)",
    subtitle: "Tu día de negocio no muere a medianoche",
    description:
      "Diseñado para la vida nocturna de bares y restaurantes: las ventas realizadas a las 2:00 a.m. pertenecen a la jornada del viernes y no al sábado. Reportes exactos por turno.",
    highlights: [
      "Corte configurable (5:00 a.m. por defecto)",
      "Usuarios y pantallas conectadas ilimitadas",
      "Multi-tenant seguro e independiente",
    ],
    colorBadge: "bg-brand-accent/10 text-brand-accent border-brand-accent/20",
  },
];

export function Features() {
  return (
    <section id="virtudes" className="py-24 bg-background relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Encabezado de la sección */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <Badge variant="outline" className="border-brand/30 bg-brand/5 text-brand dark:text-[#3E9EA2] px-4 py-1.5 text-xs sm:text-sm font-bold rounded-full">
            <Sparkles className="size-3.5" />
            <span>Virtudes y Módulos del Sistema</span>
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground">
            Diseñado para la operación real de restaurantes y bares
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed text-pretty font-normal">
            Platlia combina un POS veloz, Menú QR personalizable, trazabilidad de domicilios y control financiero estricto para Colombia.
          </p>
        </div>

        {/* Grilla de virtudes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {VIRTUDES.map((virtud, idx) => {
            const IconComponent = virtud.icon;
            return (
              <div
                key={idx}
                className="group relative rounded-3xl border border-border/80 bg-card p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-brand/40 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="size-14 rounded-2xl bg-muted/80 flex items-center justify-center text-foreground group-hover:scale-110 group-hover:bg-brand group-hover:text-brand-foreground transition-all duration-300 shadow-sm">
                      <IconComponent className="size-7" />
                    </div>
                    <Badge variant="outline" className={`text-[11px] font-extrabold px-2.5 py-1 ${virtud.colorBadge}`}>
                      Módulo Oficial
                    </Badge>
                  </div>

                  <h3 className="text-xl font-black text-foreground mb-1 group-hover:text-brand dark:group-hover:text-brand-accent transition-colors">
                    {virtud.title}
                  </h3>
                  <p className="text-xs font-bold text-brand dark:text-[#3E9EA2] mb-3">
                    {virtud.subtitle}
                  </p>
                  <p className="text-muted-foreground text-xs leading-relaxed font-normal mb-6">
                    {virtud.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-border/60 space-y-2">
                  {virtud.highlights.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-foreground font-medium">
                      <div className="size-4 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Check className="size-2.5 stroke-[3]" />
                      </div>
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
