import {
  A,
  Aparte,
  Fuerte,
  H2,
  Lista,
  ListaNumerada,
  Norma,
  P,
  Tabla,
} from "../../components/articulo";

const LEY =
  "http://www.secretariasenado.gov.co/senado/basedoc/ley_1935_2018.html";

/**
 * Verificado contra el texto de la ley en la Secretaría del Senado el
 * 2026-08-29, artículo por artículo. Cada cita de abajo es literal.
 *
 * No se cita ninguna sanción con monto: la Ley 1480 las fija en salarios mínimos
 * y el valor cambia cada año, así que un número escrito acá envejece mal. Se
 * nombra la facultad de la SIC, que es lo estable.
 */
export function Propina() {
  return (
    <>
      <P>
        La propina es lo que más discusiones genera en la mesa y lo que peor
        está resuelto en la mayoría de los sistemas de punto de venta. La regla
        la fija la <Fuerte>Ley 1935 de 2018</Fuerte>, que tiene ocho artículos y
        se lee en diez minutos. Acá está lo que dice y, sobre todo, lo que eso
        significa un viernes a las once de la noche con el salón lleno.
      </P>

      <H2 id="voluntaria">
        Primero: es voluntaria, y sugerirla está permitido
      </H2>

      <P>
        Las dos mitades importan. Un establecimiento <Fuerte>sí puede</Fuerte>{" "}
        sugerir la propina —no es ilegal ponerla en la cuenta—, pero la decisión
        final es siempre del consumidor.
      </P>

      <Norma fuente="Ley 1935 de 2018, artículo 2" url={LEY}>
        «Se entiende por propina el reconocimiento en dinero que en forma
        voluntaria el consumidor otorga a las personas que hacen parte de la
        cadena de servicios […]. <Fuerte>Parágrafo.</Fuerte> Sin perjuicio del
        ofrecimiento que el consumidor pueda realizar […], esta puede ser
        sugerida por el establecimiento de comercio y su aceptación siempre
        dependerá de la voluntad del consumidor.»
      </Norma>

      <P>
        En la práctica: una propina que aparece sola en la cuenta, ya sumada, y
        que hay que pedir que la quiten, no cumple. La aceptación tiene que ser
        un acto del cliente, no la ausencia de un reclamo.
      </P>

      <H2 id="diez-por-ciento">
        El tope es 10%, y solo aplica cuando vos la sugerís
      </H2>

      <Norma fuente="Ley 1935 de 2018, artículo 3, parágrafo 1" url={LEY}>
        «En ningún caso la propina podrá superar el 10% del valor del servicio
        prestado, cuando esta sea sugerida por el establecimiento de comercio e
        incorporada en la factura con la aceptación del consumidor.»
      </Norma>

      <P>
        El tope es sobre <Fuerte>lo que sugiere el establecimiento</Fuerte>. Si
        un cliente quiere dejar más por su cuenta, puede: la ley limita lo que
        vos proponés, no lo que él decide dar.
      </P>

      <H2 id="articulo-4">
        El artículo que casi nadie cumple: hay que preguntar antes de facturar
      </H2>

      <P>
        Este es el que suele pasar desapercibido, y es el que más cambia la
        operación.
      </P>

      <Norma fuente="Ley 1935 de 2018, artículo 4" url={LEY}>
        «La factura o el documento equivalente […] son los únicos documentos que
        deben ser entregados al consumidor,{" "}
        <Fuerte>inclusive antes de pagar</Fuerte>, con el fin de verificar los
        consumos cobrados […]. Adicionalmente, la persona que atiende al
        cliente,{" "}
        <Fuerte>
          deberá preguntarle a este si desea que su propina voluntaria sea o no
          incluida
        </Fuerte>{" "}
        en la factura o en el documento equivalente, o que indique el valor que
        quiere dar como propina.»
      </Norma>

      <P>
        O sea: la pregunta va <Fuerte>antes</Fuerte> de imprimir la cuenta, y la
        hace quien atiende. No es un cartel en la pared ni una letra chica al
        pie del tiquete. Y tiene una consecuencia técnica que casi ningún
        sistema contempla: <Fuerte>la propina no se decide en la caja</Fuerte>.
        Si el cajero la agrega al cobrar, la pre-cuenta que el mesero llevó a la
        mesa decía un total y la caja cobra otro.
      </P>

      <Aparte titulo="Cómo lo resolvimos nosotros">
        En Platlia la propina se elige en el momento en que se le pregunta al
        cliente —al pedir la cuenta en la mesa, o al confirmar el pedido en el
        menú QR, donde el que responde es el propio comensal—, no al cobrar. Y
        el selector <Fuerte>arranca siempre en «Sin propina»</Fuerte>:
        preseleccionarla es exactamente lo que el artículo 2 evita. La caja
        puede corregirla, pero ahí ya es una corrección, no la decisión.
      </Aparte>

      <H2 id="reparto">A quién le toca: solo la cadena de servicio</H2>

      <P>
        Acá la ley es más dura de lo que muchos creen, y las prohibiciones son
        explícitas.
      </P>

      <Norma fuente="Ley 1935 de 2018, artículo 5" url={LEY}>
        «Serán beneficiarios de la destinación del dinero producto de las
        propinas única y exclusivamente las personas involucradas en la cadena
        de servicios. En el evento de que no se llegue a un acuerdo […] serán
        distribuidas de manera equitativa […]. El empleador será autónomo en los
        plazos para repartir dicho recaudo, siempre y cuando este tiempo{" "}
        <Fuerte>no sea superior a un (1) mes</Fuerte>.»
      </Norma>

      <P>Y el parágrafo, que es el que suele desconocerse:</P>

      <Norma fuente="Ley 1935 de 2018, artículo 5, parágrafo 1" url={LEY}>
        «Se prohíbe a los propietarios y/o administradores […] intervenir de
        cualquier manera en la distribución de las propinas, o destinar alguna
        parte de ellas a gastos que por su naturaleza le corresponden al
        establecimiento,{" "}
        <Fuerte>tales como reposición de elementos de trabajo</Fuerte>, pago de
        turnos, reposiciones de inversión o cualquier otra que no corresponda al
        pago del trabajador.»
      </Norma>

      <Lista
        items={[
          <>
            <Fuerte>No se puede descontar de la propina</Fuerte> un plato roto,
            un faltante de caja ni la reposición de una copa.
          </>,
          <>
            <Fuerte>No se puede retener</Fuerte> lo que le corresponde a un
            trabajador por ningún motivo.
          </>,
          <>
            Se reparte entre <Fuerte>toda la cadena de servicio</Fuerte>, no
            solo entre los meseros: cocina, barra y quien atiende también
            participan.
          </>,
          <>
            El plazo máximo para repartir es <Fuerte>un mes</Fuerte>.
          </>,
        ]}
      />

      <H2 id="salario">La propina no es salario</H2>

      <Norma fuente="Ley 1935 de 2018, artículo 5, parágrafo 2" url={LEY}>
        «Los ingresos que por concepto de propinas reciban los trabajadores […]
        no constituyen salario y, por consiguiente, en ningún caso se podrán
        considerar como factor salarial, de conformidad al artículo 131 del
        Código Sustantivo del Trabajo.»
      </Norma>

      <P>
        Esto significa que la propina no entra en la base de prestaciones
        sociales ni de aportes. También significa lo contrario de lo que a veces
        se asume:{" "}
        <Fuerte>no puede usarse para completar el salario mínimo</Fuerte>.
      </P>

      <H2 id="impuestos">¿La propina lleva IVA o impuesto al consumo?</H2>

      <P>
        No. La propina no es parte del valor del servicio: el artículo 2 la
        define como un reconocimiento «independiente del valor de venta
        registrado». Va aparte del subtotal y de los impuestos, y en la factura
        electrónica viaja como un renglón con tarifa cero.
      </P>

      <P>
        Es un detalle que rompe facturas si se hace mal: si la propina se mezcla
        con los consumos, la suma de los pagos deja de coincidir con el total
        del documento y la DIAN lo rechaza. Lo desarrollamos en la{" "}
        <A href="/guias/factura-electronica-dian-para-restaurantes">
          guía de facturación electrónica
        </A>
        .
      </P>

      <H2 id="quien-vigila">Quién vigila esto</H2>

      <P>
        La <Fuerte>Superintendencia de Industria y Comercio</Fuerte>. El
        artículo 3 le encarga fijar cómo hay que informarle al consumidor sobre
        los precios y sobre la voluntariedad de la propina, y el artículo 6 le
        da la facultad de investigar los incumplimientos e imponer sanciones,
        con las herramientas del Estatuto del Consumidor (Ley 1480 de 2011).
      </P>

      <H2 id="resumen">En una tabla</H2>

      <Tabla
        encabezados={["Pregunta", "Respuesta", "Dónde dice"]}
        filas={[
          [
            "¿Puedo sugerirla?",
            "Sí, y ponerla en la factura si el cliente acepta.",
            "Art. 2, par.",
          ],
          [
            "¿Cuánto puedo sugerir?",
            "Hasta el 10% del valor del servicio.",
            "Art. 3, par. 1",
          ],
          [
            "¿Cuándo pregunto?",
            "Antes de emitir la factura, de viva voz.",
            "Art. 4",
          ],
          [
            "¿Quién la recibe?",
            "Solo la cadena de servicio, repartida en ≤ 1 mes.",
            "Art. 5",
          ],
          [
            "¿Puedo descontar roturas?",
            "No. Está expresamente prohibido.",
            "Art. 5, par. 1",
          ],
          ["¿Es salario?", "No, y no completa el mínimo.", "Art. 5, par. 2"],
          [
            "¿Lleva impuestos?",
            "No: es independiente del valor de venta.",
            "Art. 2",
          ],
        ]}
      />

      <H2 id="operacion">Qué implica todo esto en la operación</H2>

      <ListaNumerada
        items={[
          <>
            Que el sistema pueda registrar la propina{" "}
            <Fuerte>en el momento de pedir la cuenta</Fuerte>, no solo al
            cobrar.
          </>,
          <>
            Que ninguna opción venga marcada por defecto, y que «Sin propina»
            sea tan fácil de tocar como cualquier otra.
          </>,
          <>
            Que el tope sugerido no pase del 10% —si el sistema deja configurar
            un 15%, el incumplimiento lo firmás vos, no el software—.
          </>,
          <>
            Que la propina quede registrada aparte en los informes, para poder
            repartirla dentro del mes sin reconstruirla a mano.
          </>,
          <>
            Que en la carta y en el menú QR se diga que es voluntaria, que es la
            información que exige el artículo 3.
          </>,
        ]}
      />

      <P>
        Ninguna de esas cinco es difícil. Lo que las hace raras es que exigen
        haber leído la ley antes de diseñar la pantalla, y no después de la
        primera queja.
      </P>
    </>
  );
}
