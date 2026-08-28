import { BarChart3, Bot, Boxes, ChefHat, Check, Clock, QrCode, Receipt } from "lucide-react";

/**
 * Lo que hace Platlia, dicho como lo diría alguien que atiende un bar.
 *
 * El texto anterior estaba escrito desde adentro del sistema: "Trazabilidad SSE",
 * "Redis", "multi-tenant", "Módulo 1 / Módulo 2", "ICO". Nada de eso significa
 * algo para quien tiene un restaurante, y lo que no se entiende no se compra.
 * Cada tarjeta dice ahora QUÉ RESUELVE y recién después con qué.
 *
 * Se fueron también los numeritos 01–06: numerar sirve cuando el orden es
 * información —los pasos de un proceso— y acá no hay ninguna secuencia, nadie
 * usa el menú QR antes que la caja.
 */
const VIRTUDES = [
  {
    icon: Receipt,
    title: "Factura electrónica DIAN",
    subtitle: "PAGÁS SOLO LAS QUE EMITÍS",
    description:
      "Emitís la factura legal desde la misma pantalla donde cobrás: sale con su número, su CUFE y su código QR, y el cliente se la lleva impresa en la tirilla. No contratás ni configurás un proveedor aparte —la conexión con la DIAN la ponemos nosotros—: vos comprás paquetes de facturas cuando las necesitás.",
    highlights: [
      "Se compra aparte, en paquetes chicos",
      "Sin plan anual de miles de facturas sin usar",
      "Nosotros cargamos tu resolución de la DIAN",
    ],
  },
  {
    icon: ChefHat,
    title: "La cocina se entera sola",
    subtitle: "SE ACABARON LOS PAPELITOS",
    description:
      "El pedido llega a la pantalla de cocina en el momento en que se toma, con las notas del cliente tal como se pidieron. Cada cocinero toma su plato y solo él lo marca listo, así nadie se pisa y sabés cuánto tardó cada cosa.",
    highlights: [
      "Cada plato queda a nombre de quien lo hace",
      "Semáforo de demoras: verde, ámbar, rojo",
      "También imprime la comanda en papel si preferís",
    ],
  },
  {
    icon: QrCode,
    title: "Tu carta en el celular del cliente",
    subtitle: "CON TU CARA, NO CON LA NUESTRA",
    description:
      "El comensal escanea el código de la mesa y pide desde su teléfono. La carta lleva tus colores, tu logo y hasta la letra que elijas: parece tuya porque es tuya. También sirve para domicilios, con el enlace que mandás por WhatsApp.",
    highlights: [
      "Colores, letra y logo a tu gusto",
      "El cliente ve en vivo cómo va su pedido",
      "Códigos QR listos para imprimir por mesa",
    ],
  },
  {
    icon: Boxes,
    title: "Sabés cuánto te queda y cuánto ganás",
    subtitle: "EL STOCK BAJA SOLO CON CADA VENTA",
    description:
      "Cargás la receta de cada plato una vez y el inventario se descuenta solo al vender. Te avisa antes de quedarte sin algo, y como guarda el costo del día en que se vendió, el informe de marzo sigue diciendo lo mismo en diciembre.",
    highlights: [
      "Alerta antes de quedarte sin insumo",
      "Ganancia real por plato, no estimada",
      "Compras y proveedores en el mismo lugar",
    ],
  },
  {
    icon: BarChart3,
    title: "Informes que sirven para decidir",
    subtitle: "POR DÍA, SEMANA, MES O AÑO",
    description:
      "Mirá cómo viene el mes sin abrir treinta pantallas. Te muestra a qué horas entra el trabajo —para saber cuándo necesitás más gente—, cuánto tarda la cocina en cada plato y qué te deja cada producto.",
    highlights: [
      "Horas pico: cuándo hace falta más gente",
      "Cuánto tarda la cocina, y quién",
      "Comparado siempre contra el período anterior",
    ],
  },
  {
    icon: Bot,
    title: "Preguntale a tu IA cómo va el negocio",
    subtitle: "CHATGPT, CLAUDE O EL QUE USES",
    description:
      "Conectás tu asistente una vez y le preguntás en tu idioma: «¿cómo vendí esta semana?», «¿qué me falta comprar?», «¿a qué hora tengo más movimiento?». Te contesta con tus números de verdad, sin que tengas que abrir un informe ni exportar nada.",
    highlights: [
      "Solo lee: no puede cobrar ni anular nada",
      "No ve datos de tus clientes, solo tus cifras",
      "Cortás el acceso cuando quieras, de un clic",
    ],
  },
  {
    icon: Clock,
    title: "Tu día termina a las 5 a.m.",
    subtitle: "NO A MEDIANOCHE, COMO EN TU BAR",
    description:
      "Lo que vendés a las dos de la mañana del sábado pertenece a la noche del viernes, que es como lo cuenta cualquiera que trabaje de noche. El corte lo elegís vos, y por eso la caja te cuadra y los informes dicen lo que pasó de verdad.",
    highlights: [
      "El corte de jornada lo definís vos",
      "Mesas, meseros y pantallas sin límite",
      "Cada sede con su caja y sus permisos",
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
— Lo que hace Platlia
          </span>
          <h2 className="font-display font-black text-4xl sm:text-6xl uppercase tracking-tight text-[var(--papel)] leading-[0.92]">
Hecho para un servicio lleno
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
Un solo sistema para tomar el pedido, mandarlo a cocina, cobrarlo y facturarlo ante la DIAN. Pensado para bares y restaurantes en Colombia, y para las noches en que no hay tiempo de pensar.
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
                  <div className="mb-6 flex items-center">
                    <div className="size-12 rounded-xl bg-[var(--panel-2)] border border-[var(--linea-30)] flex items-center justify-center text-[var(--papel)] group-hover:bg-[var(--brasa)] group-hover:text-[var(--tinta)] transition-all duration-200">
                      <IconComponent className="size-6" />
                    </div>
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
