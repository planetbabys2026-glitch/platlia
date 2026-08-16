import {
  QrCode,
  Bike,
  Receipt,
  ChefHat,
  Boxes,
  Clock,
  Check,
} from "lucide-react";

const VIRTUDES = [
  {
    icon: QrCode,
    num: "01",
    title: "Menú Digital QR & Autopedidos",
    subtitle: "AUTOPEDIDOS EN MESA Y DOMICILIOS",
    description:
      "Genera códigos QR imprimibles para cada mesa o para mostrador. El cliente escanea desde su celular, ve tu menú con fotos reales de inventario y envía su comanda directamente a cocina.",
    highlights: [
      "Fondo personalizable y logo de tu local",
      "Autopedidos asignados a la mesa automáticamente",
      "Tarjetas QR listas para imprimir en 58mm/80mm",
    ],
  },
  {
    icon: Bike,
    num: "02",
    title: "Domicilios & Trazabilidad SSE",
    subtitle: "CHAT DE WHATSAPP Y ENLACE DE SEGUIMIENTO",
    description:
      "Gestiona tus entregas a domicilio con datos completos del cliente (Celular, Dirección, Notas). Los clientes rastrean su pedido en tiempo real vía Redis SSE y los cajeros facturan en 1 clic.",
    highlights: [
      "Trazabilidad en vivo por celular del comensal",
      "Contacto directo con cliente por WhatsApp",
      "Facturación e impresión integrada de tirilla",
    ],
  },
  {
    icon: Receipt,
    num: "03",
    title: "Caja Dividida en 2 Módulos",
    subtitle: "COBROS RÁPIDOS Y CONTROL DE EFECTIVO",
    description:
      "Estructurado en 2 áreas independientes: Módulo 1 para cobrar cuentas de salón/POS con ICO (8%), IVA y Propina sugerida; Módulo 2 para entradas, salidas, retiros, ajustes y cierre ciego.",
    highlights: [
      "Módulo 1: Cobro de Cuentas y Salón / POS",
      "Módulo 2: Entradas, Egresos y Arqueo Ciego",
      "Tiquetes térmicos imprimibles (55mm y 80mm)",
    ],
  },
  {
    icon: ChefHat,
    num: "04",
    title: "Cocina KDS & Turnero TV",
    subtitle: "COMANDAS SIN PAPELITOS PERDIDOS",
    description:
      "Las comandas viajan al instante a las pantallas KDS de cocina o bar incluyendo las observaciones específicas del cliente ('Sin cebolla', 'Término medio'). Notifica en pantalla TV cuando esté listo.",
    highlights: [
      "Notas de pedido congeladas en cada renglón",
      "Tiempos de espera por color (Verde ➔ Rojo)",
      "Modo Turnero TV pantalla completa para clientes",
    ],
  },
  {
    icon: Boxes,
    num: "05",
    title: "Inventario y Costos por Receta",
    subtitle: "DESCUENTO AUTOMÁTICO DE STOCK POR VENTA",
    description:
      "Vincula insumos e ingredientes a tus platos y bebidas. Platlia descuenta automáticamente el inventario cada vez que se vende una comanda, alertándote antes de quedar desabastecido.",
    highlights: [
      "Ficha técnica por plato y costo exacto",
      "Alertas automáticas de stock mínimo",
      "Control de proveedores y compras",
    ],
  },
  {
    icon: Clock,
    num: "06",
    title: "Jornada Nocturna Real (5:00 a.m.)",
    subtitle: "TU DÍA DE NEGOCIO NO MUERE A MEDIANOCHE",
    description:
      "Diseñado para la vida nocturna de bares y restaurantes: las ventas realizadas a las 2:00 a.m. pertenecen a la jornada del viernes y no al sábado. Reportes exactos por turno.",
    highlights: [
      "Corte configurable (5:00 a.m. por defecto)",
      "Usuarios y pantallas conectadas ilimitadas",
      "Multi-tenant seguro e independiente",
    ],
  },
];

export function Features() {
  return (
    <section id="virtudes" className="py-24 bg-[var(--tinta)] relative border-t border-dashed border-[var(--linea-30)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Encabezado de la sección */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
            — Módulos del Sistema Operativo Gastronómico
          </span>
          <h2 className="font-display font-black text-4xl sm:text-6xl uppercase tracking-tight text-[var(--papel)] leading-[0.92]">
            Diseñado para el calor del servicio
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
            Platlia combina un POS veloz, Menú QR personalizable, pantalla KDS de cocina, trazabilidad de domicilios y control financiero estricto para Colombia.
          </p>
        </div>

        {/* Grilla de virtudes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {VIRTUDES.map((virtud, idx) => {
            const IconComponent = virtud.icon;
            return (
              <div
                key={idx}
                className="group relative rounded-2xl border border-[var(--linea-16)] bg-[var(--panel-bg)] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--brasa)]/60 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="size-12 rounded-xl bg-[var(--panel-2)] border border-[var(--linea-30)] flex items-center justify-center text-[var(--papel)] group-hover:bg-[var(--brasa)] group-hover:text-[var(--tinta)] transition-all duration-200">
                      <IconComponent className="size-6" />
                    </div>
                    <span className="font-mono text-xs font-bold text-[var(--linea-55)] tracking-widest">
                      {virtud.num}
                    </span>
                  </div>

                  <h3 className="font-display font-black text-2xl uppercase tracking-tight text-[var(--papel)] mb-1 group-hover:text-[var(--brasa)] transition-colors">
                    {virtud.title}
                  </h3>
                  <p className="font-mono text-rotulo font-bold text-[var(--brasa)] tracking-wider mb-3">
                    {virtud.subtitle}
                  </p>
                  <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed mb-6">
                    {virtud.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-dashed border-[var(--linea-30)] space-y-2">
                  {virtud.highlights.map((h, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-xs text-[var(--papel)] font-medium">
                      <div className="size-4 rounded-full bg-[var(--papel)] text-[var(--tinta)] flex items-center justify-center shrink-0">
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
