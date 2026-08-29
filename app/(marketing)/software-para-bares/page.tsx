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
 * La página del término "software para bares".
 *
 * Es la que tiene ventaja real: casi nadie escribe para ese término —los
 * competidores lo tratan como un sinónimo de restaurante— y acá hay algo
 * concreto y verdadero que decir que ninguno dice, que es que la jornada no
 * termina a medianoche. Ese es el ángulo de toda la página, no una lista de
 * funciones con la palabra "bar" cambiada.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { vigente } = await preciosVigentes();
  const desde = mensualDeLaLista(vigente, 1);
  const precio = desde === null ? "" : ` Desde ${formatCop(desde)} al mes.`;

  const descripcion =
    `Hecho para la noche: la jornada no corta a medianoche, así el cierre de caja de ` +
    `madrugada cuadra. Comanda a barra, turnos e inventario.${precio} 7 días gratis.`;

  return {
    title: "Software para bares en Colombia",
    description: descripcion,
    alternates: { canonical: "/software-para-bares" },
    openGraph: {
      title: "Software para bares en Colombia · Platlia",
      description: descripcion,
      url: "/software-para-bares",
    },
    twitter: {
      title: "Software para bares en Colombia",
      description: descripcion,
    },
  };
}

export default async function SoftwareParaBares() {
  const { vigente: lista, base, promo } = await preciosVigentes();

  return (
    <PaginaSegmento
      eyebrow="Software para bares · Colombia"
      titulo={
        <>
          Software para bares
          <br />
          <span className="text-[var(--brasa)]">
            donde la noche no se parte en dos
          </span>
        </>
      }
      bajada="Lo que vendés a las dos de la mañana pertenece a la noche anterior. Si tu sistema no lo entiende, ningún informe va a coincidir nunca con lo que había en la caja."
      problema={{
        titulo: "Tu noche cruza la medianoche. Tu software, no",
        cuerpo: (
          <>
            <p>
              Casi todo el software de punto de venta corta el día a las 00:00,
              porque así lo hace el calendario. Para un restaurante de almuerzos
              da igual. Para un bar es el origen de todos los descuadres.
            </p>
            <p>
              La noche del viernes queda repartida entre viernes y sábado. El
              informe del viernes muestra media noche; el del sábado muestra la
              otra mitad más la mitad de la del sábado. Ninguno coincide con el
              arqueo, y comparar un viernes con otro deja de significar algo.
            </p>
            <p>
              La solución no es filtrar por rango de horas cada vez. Es que el
              sistema sepa a qué hora empieza tu jornada.
            </p>
          </>
        ),
      }}
      capacidades={[
        {
          titulo: "La jornada empieza cuando vos digas",
          detalle:
            "Por defecto a las 5 de la mañana, y lo cambiás. Todo lo que se venda antes de esa hora pertenece a la jornada anterior: informes, arqueo y cierre, todos de acuerdo.",
        },
        {
          titulo: "Cierre de caja que se traba si falta cobrar",
          detalle:
            "Si quedó una cuenta abierta, el cierre no pasa y te dice cuál por su nombre. Es la red al final del turno, no un cartel toda la noche.",
        },
        {
          titulo: "Turnos con responsable",
          detalle:
            "Cada apertura registra quién abrió y con cuánta base; cada cierre, quién contó y cuánto dio la diferencia. Varios turnos pueden vivir dentro de la misma jornada.",
        },
        {
          titulo: "Comanda a la barra",
          detalle:
            "Lo que se prepara en barra sale en su pantalla o impreso, separado de la cocina. Con el identificador grande, que es lo que se busca de lejos.",
        },
        {
          titulo: "Inventario de botellas y trago",
          detalle:
            "Una botella que se vende por trago se descuenta por receta. El stock puede quedar negativo a propósito: es lo que muestra el faltante en el arqueo en vez de esconderlo en cero.",
        },
        {
          titulo: "Propina como manda la ley",
          detalle:
            "Se pregunta antes de imprimir la cuenta, arranca siempre en «sin propina» y el tope sugerido no pasa del 10%. Es lo que exige la Ley 1935 de 2018.",
        },
        {
          titulo: "Menú QR para la mesa",
          detalle:
            "El cliente escanea y pide desde su teléfono, con tus colores. En una noche llena, es una mesa menos por la que hay que pasar.",
        },
        {
          titulo: "Factura electrónica DIAN",
          detalle:
            "Incluida la conexión. Las facturas se compran por paquete, así no pagás un plan anual de miles que no vas a usar.",
        },
      ]}
      bloques={[
        {
          titulo: "Qué cambia cuando la jornada está bien definida",
          cuerpo: (
            <>
              <p>
                Aparecen respuestas que con el corte a medianoche son
                imposibles. A qué hora hay que tener más gente en el piso
                —contando por la hora en que se abre la mesa, no por la del
                pago, porque una mesa que se sienta a las 9 y paga a la 1 es
                trabajo de las 9—. Cuánto vende un viernes contra otro viernes.
                Si el turno de la madrugada se paga solo.
              </p>
              <p>
                Y algo más simple: que el número del informe sea el mismo que el
                del arqueo. Cuando no lo es, nadie vuelve a confiar en ninguno
                de los dos.
              </p>
            </>
          ),
        },
        {
          titulo: "Los domicilios se abren y se cierran con el turno",
          cuerpo: (
            <>
              <p>
                Que tu negocio reparta no significa que esté recibiendo pedidos
                ahora. El cajero abre y cierra los domicilios por QR desde su
                pantalla.
              </p>
              <p>
                Sin eso, alguien manda un domicilio a las cuatro de la mañana
                con la caja cerrada y el local vacío: el pedido entra perfecto y
                espera a que alguien lo descubra al otro día, con un cliente del
                otro lado que ya dio su dirección.
              </p>
            </>
          ),
        },
        {
          titulo: "Sin equipos que comprar",
          cuerpo: (
            <>
              <p>
                Funciona en el navegador de cualquier celular, tablet o
                computador que ya tengas. Si querés imprimir, sirve una térmica
                común de 58 u 80 mm conectada a un computador del local.
              </p>
              <p>
                Mesas, meseros y pantallas sin límite: la licencia es por local,
                no por usuario.
              </p>
            </>
          ),
        },
      ]}
      guiasDestacadas={[
        "cierre-de-caja-en-un-bar",
        "propina-en-colombia",
        "impuesto-al-consumo-o-iva-en-restaurantes",
        "costo-por-plato",
      ]}
      lista={lista}
      base={base}
      promo={promo}
      mensualCop={mensualDeLaLista(lista, 1)}
    />
  );
}
