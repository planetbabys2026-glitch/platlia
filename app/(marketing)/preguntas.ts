/**
 * Las preguntas que frenan una venta, con su respuesta.
 *
 * **Una sola fuente para las dos caras.** Las mismas preguntas se pintan en la
 * página y se declaran en el marcado que leen Google y los asistentes: Google
 * exige que el contenido de un `FAQPage` esté visible, y marcar preguntas que no
 * aparecen en pantalla es una violación que se paga con el posicionamiento. Si
 * vivieran en dos archivos, la primera edición las separaría.
 *
 * Son las que de verdad detienen una compra —cuánto cuesta, si la factura va
 * aparte, si hay permanencia, qué equipo hace falta—, no las que uno quisiera
 * que preguntaran. Un asistente cita la respuesta tal cual, así que cada una
 * tiene que ser cierta y entenderse sola, sin el resto de la página.
 */

export type Pregunta = { pregunta: string; respuesta: string };

export function preguntasFrecuentes(mensualCop: number | null): Pregunta[] {
  const precio =
    mensualCop === null
      ? "La licencia se cobra por local, al mes, en pesos colombianos. Podés verla en la sección de precios."
      : `La licencia cuesta $${mensualCop.toLocaleString("es-CO")} COP al mes por local, sin límite de mesas, meseros ni pantallas. Pagando seis meses te regalamos uno, y pagando doce te regalamos dos. Hay 7 días de prueba gratis y no pedimos tarjeta.`;

  return [
    { pregunta: "¿Cuánto cuesta Platlia?", respuesta: precio },
    {
      pregunta: "¿La factura electrónica de la DIAN está incluida?",
      respuesta:
        "No. La licencia mensual no incluye las facturas: se compran aparte, por paquete, según cuántas emitas al año. Podés empezar con un paquete chico y sumar cuando se acabe, así no pagás un plan anual de miles de facturas que no vas a usar. La conexión con la DIAN la ponemos nosotros: vos no contratás ni configurás un proveedor.",
    },
    {
      pregunta: "¿Necesito comprar equipos o una caja registradora?",
      respuesta:
        "No. Platlia funciona en el navegador de cualquier celular, tablet o computador que ya tengas. Si querés imprimir comandas y recibos, sirve una impresora térmica común de 58 mm u 80 mm conectada a un computador del local.",
    },
    {
      pregunta: "¿Tiene contrato de permanencia?",
      respuesta:
        "No. Se paga mes a mes y cancelás cuando quieras desde la misma aplicación. Lo que ya pagaste lo usás hasta el final del período.",
    },
    {
      pregunta: "¿Sirve para un bar que cierra de madrugada?",
      respuesta:
        "Sí, está hecho para eso. El día de negocio no termina a medianoche: lo que vendés a las dos de la mañana pertenece a la noche anterior, y el corte lo definís vos. Por eso la caja cuadra y los informes dicen lo que pasó de verdad en cada turno.",
    },
    {
      pregunta: "¿Puedo tener más de una sede?",
      respuesta:
        "Sí. Cada sede tiene su propia caja, su carta y sus permisos. De tres locales en adelante manejamos una tarifa de cadena: escribinos y la coordinamos.",
    },
    {
      pregunta: "¿El cliente puede pedir desde su celular?",
      respuesta:
        "Sí. Cada mesa tiene su código QR: el comensal escanea, ve la carta con tus colores y tu logo, y manda el pedido a cocina desde su teléfono. También sirve para domicilios, con un enlace que compartís por WhatsApp.",
    },
    {
      pregunta: "¿De verdad puedo preguntarle a ChatGPT cómo va mi negocio?",
      respuesta:
        "Sí. Platlia te da una llave que pegás una vez en tu asistente —ChatGPT, Claude o el que uses— y desde ahí le preguntás en tu idioma: «¿cuánto vendí esta semana?», «¿qué me falta comprar?». El asistente solo puede LEER: no puede cobrar, anular ni cambiar nada, y no ve datos de tus clientes —ni nombres, ni teléfonos, ni direcciones—, solo tus cifras. Cada sede tiene su propia llave y la cortás cuando quieras.",
    },
    {
      pregunta: "¿Cuánto tarda en quedar funcionando?",
      respuesta:
        "El mismo día. Creás la cuenta, cargás tu carta y ya podés tomar pedidos y cobrar esa misma noche. Si querés, te ayudamos a cargar el menú y el inventario.",
    },
  ];
}
