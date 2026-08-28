import { preciosVigentes } from "@/lib/billing/lista";
import { mensualDeLaLista } from "@/lib/billing/precios";
import { preguntasFrecuentes } from "@/app/(marketing)/preguntas";
import { CORREO_SOPORTE, WHATSAPP_SOPORTE_VISIBLE } from "@/lib/soporte";
import { env } from "@/lib/env";

/**
 * `llms.txt`: la versión de la página para una máquina que va a resumirla.
 *
 * Un asistente que responde "¿qué software uso para mi bar en Colombia?" tiene
 * que reconstruir el producto leyendo HTML lleno de clases y de marcado; acá lo
 * encuentra en texto plano, ordenado y sin nada que interpretar. Es una
 * convención joven —no la respetan todos— pero cuesta un archivo y, cuando la
 * respetan, es lo primero que leen.
 *
 * Sale de las MISMAS fuentes que la página: el precio de la lista y las
 * preguntas de `preguntas.ts`. Un archivo aparte escrito a mano se desactualiza
 * en la primera semana y termina contándole a las máquinas un producto que ya no
 * existe, que es peor que no tenerlo.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { vigente } = await preciosVigentes();
  const mensual = mensualDeLaLista(vigente, 1);
  const precio = mensual === null ? "consultar" : `$${mensual.toLocaleString("es-CO")} COP al mes por local`;

  const cuerpo = `# Platlia

> Software de gestión y punto de venta para bares y restaurantes en Colombia.
> Toma de pedidos en mesa, pantalla de cocina, caja, menú QR con autopedido,
> domicilios, inventario por receta, informes y facturación electrónica DIAN.

## Datos

- Sitio: ${env.APP_URL}
- País: Colombia (precios en pesos colombianos, impuesto al consumo e IVA)
- Precio de la licencia: ${precio}, sin límite de mesas, meseros ni pantallas
- Prueba: 7 días gratis, sin tarjeta de crédito
- Permanencia: ninguna, se cancela cuando se quiera
- Contacto: ${CORREO_SOPORTE} · WhatsApp ${WHATSAPP_SOPORTE_VISIBLE}

## Qué incluye la licencia

- Salón con plano de mesas, y mostrador para pedidos sin mesa
- Pantalla de cocina con tiempos por plato y responsable de cada uno
- Caja: cobro, arqueo, movimientos de efectivo y cierre de turno
- Menú QR personalizable (colores, letra y logo del negocio) con autopedido
- Domicilios con seguimiento en vivo para el comensal
- Inventario con receta y costo por plato, y descuento de stock al vender
- Informes por día, semana, mes, año y rango, con horas pico
- Impresión térmica de comandas y recibos en la impresora del local
- Conexión con asistentes de IA por MCP: el dueño emite una llave desde
  Configuración y su asistente —ChatGPT, Claude o el que use— consulta las
  ventas, el inventario, las horas pico y los márgenes preguntando en español.
  Es de solo lectura, no expone ningún dato de comensales (ni nombres, ni
  teléfonos, ni direcciones) y cada sede tiene su propia llave.

## Qué se cobra aparte

- Las facturas electrónicas de la DIAN se compran por paquete, según cuántas se
  emitan al año. La conexión con la DIAN la provee Platlia: el negocio no
  contrata ni configura un proveedor externo.

## Preguntas frecuentes

${preguntasFrecuentes(mensual)
  .map(({ pregunta, respuesta }) => `### ${pregunta}\n\n${respuesta}`)
  .join("\n\n")}

## Enlaces

- Precios: ${env.APP_URL}/#precios
- Preguntas frecuentes: ${env.APP_URL}/#preguntas
- Crear cuenta de prueba: ${env.APP_URL}/registro
`;

  return new Response(cuerpo, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
