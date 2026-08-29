import type { Metadata } from "next";
import { preciosVigentes } from "@/lib/billing/lista";
import { mensualDeLaLista } from "@/lib/billing/precios";
import { formatCop } from "@/lib/money";
import { PaginaSegmento } from "../components/pagina-segmento";

/**
 * Se regenera cada 5 minutos, y hace falta.
 *
 * Esta página lee el precio de la lista, pero una consulta a la base NO alcanza
 * para que Next la considere dinámica —solo lo hacen las APIs dinámicas como
 * `cookies()` o `searchParams`—, así que quedaba prerenderizada en el build con
 * el precio horneado en el HTML. Verificado: el `$69.900` estaba escrito dentro
 * de `.next/server/app/*.html`.
 *
 * O sea que la promesa de que una promoción se refleja sola era falsa: hacía
 * falta volver a desplegar. Y detener una promoción es urgente por definición
 * —existe una acción aparte justamente para eso—, así que la ventana no puede
 * ser de una hora.
 *
 * 5 minutos y no `force-dynamic`: la página sigue sirviéndose desde caché, que
 * es lo que le conviene a un rastreador y a alguien que la abre con datos
 * flojos, y el precio nunca puede estar más de 5 minutos desactualizado.
 */
export const revalidate = 300;

/**
 * La página del término "software para restaurantes".
 *
 * El precio va en la descripción y sale de la lista, igual que en la portada: un
 * resultado que dice "desde $69.900" recibe muchos más clics que uno que no dice
 * nada, y escribirlo a mano sería el mismo defecto que ya costó que el hero
 * prometiera una cifra distinta de la que cobraba el checkout.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { vigente } = await preciosVigentes();
  const desde = mensualDeLaLista(vigente, 1);
  const precio = desde === null ? "" : ` Desde ${formatCop(desde)} al mes.`;

  const descripcion =
    `Pedidos en mesa, comanda a cocina, menú QR, costo por plato y factura ` +
    `electrónica DIAN.${precio} 7 días gratis, sin tarjeta.`;

  return {
    title: "Software para restaurantes en Colombia",
    description: descripcion,
    alternates: { canonical: "/software-para-restaurantes" },
    openGraph: {
      title: "Software para restaurantes en Colombia · Platlia",
      description: descripcion,
      url: "/software-para-restaurantes",
    },
    twitter: {
      title: "Software para restaurantes en Colombia",
      description: descripcion,
    },
  };
}

export default async function SoftwareParaRestaurantes() {
  const { vigente: lista, base, promo } = await preciosVigentes();

  return (
    <PaginaSegmento
      eyebrow="Software para restaurantes · Colombia"
      titulo={
        <>
          Software para restaurantes
          <br />
          <span className="text-[var(--brasa)]">que sabe cuánto ganás</span>
        </>
      }
      bajada="Tomás el pedido en la mesa, sale la comanda en cocina y la cuenta llega a caja con la factura electrónica lista. Y al cerrar sabés no solo cuánto vendiste, sino cuánto te costó."
      problema={{
        titulo: "El problema no es tomar el pedido",
        cuerpo: (
          <>
            <p>
              Casi cualquier sistema toma un pedido y lo cobra. Lo que casi
              ninguno hace es decirte, al final del mes, qué platos te dejaron
              plata y cuáles la perdieron.
            </p>
            <p>
              Para eso hacen falta tres cosas juntas: costear cada plato por su
              receta, congelar ese costo en el momento de la venta —si no, el
              informe de marzo cambia cada vez que sube un proveedor en
              diciembre— y comparar el margen contra la base gravable y no
              contra el total con impuesto.
            </p>
            <p>
              Ninguna de las tres se ve en una demostración. Las tres deciden si
              tus informes sirven para tomar decisiones o solo para saber cuánto
              entró.
            </p>
          </>
        ),
      }}
      capacidades={[
        {
          titulo: "Pedido en la mesa, desde cualquier celular",
          detalle:
            "El mesero toma desde su teléfono y la comanda sale en cocina en el momento. Sin equipos que comprar: funciona en el navegador de lo que ya tenés.",
        },
        {
          titulo: "Pantalla de cocina con tiempos por plato",
          detalle:
            "Cada plato registra quién lo tomó y cuándo quedó listo, así se separa lo que esperó en la fila de lo que tardó en cocinarse. Son dos problemas distintos con soluciones distintas.",
        },
        {
          titulo: "Menú QR con autopedido",
          detalle:
            "El comensal escanea, ve tu carta con tus colores y manda el pedido desde su teléfono. Sirve también para domicilios, con un enlace que compartís por WhatsApp.",
        },
        {
          titulo: "Inventario por receta",
          detalle:
            "Vender un plato descuenta cada insumo de su receta. El costo se calcula por promedio ponderado, así una compra cara no reevalúa lo que ya tenías.",
        },
        {
          titulo: "Factura electrónica DIAN",
          detalle:
            "La conexión la ponemos nosotros: no contratás ni configurás un proveedor aparte. Las facturas se compran por paquete, según cuántas emitas.",
        },
        {
          titulo: "Informes por día, semana, mes y año",
          detalle:
            "Con el período anterior del mismo tamaño al lado, que es lo único que hace que una comparación signifique algo.",
        },
        {
          titulo: "Impresión térmica de comandas y recibos",
          detalle:
            "Una comanda no es un recibo con otro título: no lleva precios y sí lleva grande el identificador, que es lo único que se busca de lejos entre seis papeles colgados.",
        },
        {
          titulo: "Preguntale a tu asistente de IA",
          detalle:
            "Conectás ChatGPT o Claude y le preguntás en tu idioma cómo va el negocio. Solo puede leer, y nunca ve datos de tus comensales.",
        },
      ]}
      bloques={[
        {
          titulo: "El costo se congela cuando vendés",
          cuerpo: (
            <>
              <p>
                Es la decisión técnica que más cambia un informe. Si el costo de
                una venta se reconstruye cruzando el renglón con la receta{" "}
                <strong className="font-semibold text-[var(--papel)]">
                  actual
                </strong>
                , entonces todos tus informes históricos se mueven solos cada
                vez que cambia un precio de compra.
              </p>
              <p>
                Acá el costo unitario se escribe en el renglón en el momento de
                la venta, junto con la tarifa de impuesto. Un informe viejo dice
                siempre lo mismo, que es la única forma de comparar dos meses.
              </p>
            </>
          ),
        },
        {
          titulo: "Nada llega a la caja porque sí",
          cuerpo: (
            <>
              <p>
                Que la cocina termine un plato no significa que el cliente
                quiera irse. Una cuenta llega a la caja cuando alguien la manda:
                el mesero desde la mesa, o quien atiende desde el punto de
                venta.
              </p>
              <p>
                Parece un detalle y es la diferencia entre un cajero que ve las
                cuentas que hay que cobrar y uno que ve todas las mesas del
                salón, incluidas las que recién se sentaron.
              </p>
            </>
          ),
        },
        {
          titulo: "Varias sedes, cada una con lo suyo",
          cuerpo: (
            <>
              <p>
                Cada sede tiene su caja, su carta, su inventario y sus permisos,
                y nada se mezcla entre una y otra. La licencia es de la cuenta,
                no de cada local: se paga una sola vez y las fechas de todas las
                sedes van sincronizadas.
              </p>
              <p>
                De tres locales en adelante hay tarifa de cadena. Escribinos y
                la coordinamos.
              </p>
            </>
          ),
        },
      ]}
      guiasDestacadas={[
        "costo-por-plato",
        "factura-electronica-dian-para-restaurantes",
        "impuesto-al-consumo-o-iva-en-restaurantes",
        "propina-en-colombia",
      ]}
      lista={lista}
      base={base}
      promo={promo}
      mensualCop={mensualDeLaLista(lista, 1)}
    />
  );
}
