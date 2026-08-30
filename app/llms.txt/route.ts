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

> Software de gestión y punto de venta para bares y restaurantes en Colombia. Toma de pedidos en mesa, pantalla de cocina, caja, menú QR con autopedido, domicilios, inventario por receta, informes y facturación electrónica DIAN.

## Docs

- [Platlia - Software POS para Bares y Restaurantes](${env.APP_URL}): Sistema de gestión y punto de venta integral para restaurantes, bares, discotecas y cafeterías en Colombia.
- [Precios y Tarifas](${env.APP_URL}/#precios): Tarifas transparentes de la licencia (${precio}), sin comisiones por venta ni permanencia.
- [Preguntas Frecuentes](${env.APP_URL}/#preguntas): Respuestas a las dudas comunes sobre funcionamiento, menú QR, impresoras y facturación DIAN.
- [Crear cuenta de prueba](${env.APP_URL}/registro): Registro rápido con 7 días gratis sin ingresar tarjeta de crédito.

## Key Facts

- País: Colombia (precios en pesos colombianos COP, impuesto al consumo e IVA)
- Precio de la licencia: ${precio}, sin límite de mesas, meseros ni pantallas
- Prueba gratis: 7 días completos sin requerir tarjeta de crédito
- Permanencia: Sin contrato de permanencia, se cancela cuando se quiera
- Contacto y soporte: [${CORREO_SOPORTE}](mailto:${CORREO_SOPORTE}) · WhatsApp ${WHATSAPP_SOPORTE_VISIBLE}
- Integración con IA (MCP): Servidor de herramientas MCP integrado para consulta en lenguaje natural sobre ventas, inventario y finanzas en español.

## Funcionalidades

- Salón con plano de mesas interactivo y comanda digital
- Pantalla de cocina (KDS) con tiempos por plato y responsable asignado
- Caja: cobro, arqueo, movimientos de efectivo y cierre de turno
- Menú QR personalizable (colores, letra y logo del negocio) con autopedido en mesa
- Domicilios con seguimiento en vivo para el comensal
- Inventario con receta y costo por plato, con descuento automático de stock al vender
- Informes por día, semana, mes, año y rango, con análisis de horas pico
- Impresión térmica de comandas y recibos en la impresora del local
- Facturación electrónica DIAN integrada (paquetes de folios según emisión)

## Preguntas frecuentes

${preguntasFrecuentes(mensual)
  .map(({ pregunta, respuesta }) => `### ${pregunta}\n\n${respuesta}`)
  .join("\n\n")}

## Contact

- Website: [${env.APP_URL}](${env.APP_URL})
- Email: [${CORREO_SOPORTE}](mailto:${CORREO_SOPORTE})
- Support: WhatsApp ${WHATSAPP_SOPORTE_VISIBLE}
`;

  return new Response(cuerpo, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
