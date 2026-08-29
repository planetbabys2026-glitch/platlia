import {
  A,
  Aparte,
  Fuerte,
  H2,
  H3,
  Lista,
  ListaNumerada,
  P,
  Tabla,
} from "../../components/articulo";

/**
 * Lo aprendido integrando facturación electrónica contra la API de un proveedor
 * tecnológico real, no leyendo la documentación.
 *
 * **Se nombra el problema, no el proveedor.** Los nombres exactos de los campos
 * cambian entre proveedores; los errores no. Escribirlo atado a uno solo lo
 * volvería inútil para quien usa otro, que es la mayoría de quienes buscan esto.
 */
export function FacturaDian() {
  return (
    <>
      <P>
        La facturación electrónica se explica siempre igual: te habilitás ante
        la DIAN, conseguís un rango de numeración, conectás un proveedor y
        listo. Eso es cierto y no es lo que sale mal. Lo que sale mal son cuatro
        o cinco cosas concretas que no aparecen en ninguna documentación y que
        se descubren con una factura rechazada y alguien esperando el papel.
      </P>

      <P>
        Esto es lo que encontramos construyendo la emisión de verdad. Los
        nombres de los campos cambian según el proveedor que uses; los problemas
        son los mismos en todos.
      </P>

      <H2 id="precio">1. El precio de tu carta no es la base gravable</H2>

      <P>
        Es el error más caro y el más fácil de cometer. En Colombia el precio
        que va en la carta es el precio <Fuerte>final</Fuerte>: la cerveza vale
        $5.000 y el cliente paga $5.000, impuesto incluido. Pero la factura
        electrónica pide el precio unitario <Fuerte>sin impuesto</Fuerte>, y le
        suma la tarifa encima.
      </P>

      <P>
        Si mandás los $5.000 tal como están en la carta, el proveedor le agrega
        el 8% y factura $5.400. El cliente pagó $5.000, la DIAN recibió $5.400,
        y la diferencia la vas a descubrir en la declaración.
      </P>

      <Aparte titulo="Cómo se saca la base">
        Hay que ir para atrás: base = precio ÷ 1,08. Y conviene calcular el
        impuesto <Fuerte>por diferencia</Fuerte> —impuesto = precio − base— en
        vez de multiplicar la base por 8%. Multiplicando, base + impuesto casi
        nunca da exactamente el precio de carta, y esos pesos de diferencia son
        los que descuadran la cuenta.
      </Aparte>

      <H2 id="propina">2. La propina tiene que viajar, y no como impuesto</H2>

      <P>
        Una factura electrónica se valida, entre otras cosas, comparando el
        total del documento contra la suma de los medios de pago. Si el cliente
        dejó propina, los pagos la incluyen; si la propina no viaja en el
        documento, la diferencia se dispara y la factura se rechaza.
      </P>

      <P>
        La forma que funciona es mandarla como{" "}
        <Fuerte>un renglón más, con tarifa cero</Fuerte>, del tipo «Propina
        voluntaria». Es coherente con la ley —la propina no hace parte de la
        base gravable del impuesto al consumo— y no depende de catálogos de
        conceptos que cada proveedor implementa distinto.
      </P>

      <H2 id="nota-credito">
        3. La nota crédito no es una factura con otro código
      </H2>

      <P>
        Esta cuesta una tarde entera. La intuición dice que una nota crédito es
        el mismo documento con un tipo distinto, así que se manda al mismo sitio
        cambiando un campo. No funciona, y el error que devuelve no ayuda: habla
        del rango de numeración, no del documento.
      </P>

      <Lista
        items={[
          <>
            Va a <Fuerte>su propio endpoint</Fuerte>, no al de facturas de
            venta.
          </>,
          <>
            Usa <Fuerte>su propio rango de numeración</Fuerte>: ante la DIAN,
            «Factura de Venta» y «Nota Crédito» son resoluciones distintas.
            Tener una no te da la otra.
          </>,
          <>
            Referencia la factura original por su <Fuerte>número</Fuerte>, y
            lleva un código de concepto de corrección.
          </>,
        ]}
      />

      <H3>Y devuelve CUDE, no CUFE</H3>

      <P>
        El identificador único de una factura de venta es el{" "}
        <Fuerte>CUFE</Fuerte>; el de una nota crédito es el{" "}
        <Fuerte>CUDE</Fuerte>. Un sistema que lee solamente el campo{" "}
        <code className="font-mono text-sm">cufe</code> va a recibir una nota
        crédito validada por la DIAN, no encontrar el campo, y guardarla como
        error.
      </P>

      <P>
        Ese es el peor estado posible:{" "}
        <Fuerte>
          el documento existe ante la DIAN y tu sistema cree que no
        </Fuerte>
        . El reintento no puede recrearlo —el número ya se consumió— y la
        contabilidad no lo tiene.
      </P>

      <H2 id="doble-emision">4. Dos clics son dos facturas</H2>

      <P>
        Un botón de emitir que tarda tres segundos se toca dos veces. Sin
        protección, eso son dos documentos ante la DIAN por la misma venta, y
        anular uno exige una nota crédito.
      </P>

      <P>
        La guarda que funciona no es un{" "}
        <code className="font-mono text-sm">if</code> antes de emitir —entre
        leer y escribir pasa el segundo clic—: es reclamar la venta con una
        escritura condicionada, que la base resuelve de forma atómica. Y el
        reclamo tiene que <Fuerte>caducar</Fuerte>: si el proceso se muere con
        la venta reclamada, sin vencimiento esa factura no la emite nadie nunca
        más.
      </P>

      <H2 id="respuesta-perdida">
        5. Si se corta la respuesta, el documento existe igual
      </H2>

      <P>
        La red se cae después de que la DIAN validó y antes de que tu sistema
        reciba la confirmación. El documento está emitido y vos no lo sabés.
      </P>

      <P>
        Por eso cada factura tiene que salir con un{" "}
        <Fuerte>código de referencia propio y estable</Fuerte>, derivado del
        identificador de la venta, para poder preguntarle después al proveedor
        «¿ya existe un documento con esta referencia?». Sin esa segunda vuelta,
        el reintento crea un duplicado.
      </P>

      <Aparte titulo="Un detalle que muerde una vez al año">
        Si el código de referencia incluye el año en curso, dos reintentos a
        caballo del 31 de diciembre generan dos referencias distintas para la
        misma venta —y por lo tanto dos documentos—. Tiene que derivarse solo
        del identificador de la venta.
      </Aparte>

      <H2 id="errores">
        6. Que la respuesta traiga errores no significa que se rechazó
      </H2>

      <P>
        La DIAN devuelve notificaciones que conviven con una factura
        perfectamente válida: avisos sobre el RUT, sobre datos del adquiriente,
        códigos que empiezan por FAJ o RUT. Un sistema que trate cualquier lista
        de errores no vacía como un rechazo va a marcar como fallidas facturas
        que sí se validaron.
      </P>

      <P>
        Lo que decide es el campo que dice si el documento{" "}
        <Fuerte>quedó validado</Fuerte>, no la presencia de avisos.
      </P>

      <H2 id="totales">
        Los totales no van a coincidir al centavo, y está bien
      </H2>

      <P>
        Si vos sacás el impuesto por diferencia —para que base + impuesto dé
        exacto el precio de carta— y el proveedor lo recalcula multiplicando la
        base por la tarifa, los dos números van a diferir en centavos. Una venta
        de $5.000 se factura $5.000,40.
      </P>

      <P>
        Eso no es un error: es el ajuste de redondeo, y la factura es válida. Lo
        que hay que tener es la certeza de <Fuerte>cuánta</Fuerte> es la
        diferencia esperada, para poder distinguirla de una de verdad.
      </P>

      <H2 id="checklist">Antes de emitir la primera</H2>

      <ListaNumerada
        items={[
          <>
            Tener el <Fuerte>rango de numeración</Fuerte> de factura de venta{" "}
            <Fuerte>y el de nota crédito</Fuerte>. Son dos resoluciones.
          </>,
          <>
            Verificar que el sistema manda la <Fuerte>base sin impuesto</Fuerte>{" "}
            y no el precio de carta.
          </>,
          <>
            Verificar que distingue{" "}
            <A href="/guias/impuesto-al-consumo-o-iva-en-restaurantes">
              IVA de impuesto al consumo
            </A>{" "}
            con el código que corresponde.
          </>,
          <>
            Emitir una <Fuerte>de prueba en ambiente de pruebas</Fuerte> y otra
            real de valor bajo, con propina, y comparar los totales renglón por
            renglón.
          </>,
          <>
            Emitir una <Fuerte>nota crédito</Fuerte> sobre esa factura antes de
            necesitarla en serio. Es donde aparecen la mitad de los problemas.
          </>,
        ]}
      />

      <H2 id="tabla">Resumen</H2>

      <Tabla
        encabezados={["Problema", "Síntoma", "Qué pasa si no se ve"]}
        filas={[
          [
            "Precio con impuesto adentro",
            "Facturás más de lo que cobraste",
            "Diferencia en la declaración",
          ],
          [
            "Propina fuera del documento",
            "Rechazo por descuadre de pagos",
            "Ninguna venta con propina se factura",
          ],
          [
            "Nota crédito al endpoint equivocado",
            "Error sobre el rango",
            "No podés anular nada",
          ],
          [
            "Leer solo CUFE",
            "Nota válida guardada como error",
            "Documento existe y no está registrado",
          ],
          [
            "Sin guarda de doble clic",
            "Dos facturas por una venta",
            "Anulación manual, una por una",
          ],
          [
            "Errores tratados como rechazo",
            "Facturas válidas marcadas mal",
            "Reemisión y duplicados",
          ],
        ]}
      />

      <P>
        Nada de esto aparece leyendo la documentación de la DIAN, porque no son
        problemas de la DIAN: son de la distancia entre cómo funciona un
        restaurante y cómo está pensado el formato. Que un sistema los tenga
        resueltos no se ve en una demostración —se ve el día que hay que emitir
        una nota crédito con el cliente adelante—.
      </P>
    </>
  );
}
