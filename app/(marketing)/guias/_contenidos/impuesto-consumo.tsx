import {
  A,
  Aparte,
  Fuerte,
  H2,
  H3,
  Lista,
  Norma,
  P,
  Tabla,
} from "../../components/articulo";

const ART_512_9 = "https://estatuto.co/512-9";
const ART_512_1 = "https://estatuto.co/512-1";

/**
 * Verificado contra el texto del Estatuto Tributario el 2026-08-29.
 *
 * **El umbral se expresa en UVT y no en pesos, a propósito.** La UVT cambia
 * todos los años: un número en pesos escrito acá queda mal en enero y nadie se
 * acuerda de volver. Lo estable es el "3.500 UVT" del artículo, y el enlace a la
 * DIAN para el valor del año.
 */
export function ImpuestoAlConsumo() {
  return (
    <>
      <P>
        Un restaurante en Colombia normalmente <Fuerte>no cobra IVA</Fuerte>:
        cobra impuesto al consumo, el 8%. Suena simple y sin embargo es la
        confusión más frecuente de la categoría, porque hay tres o cuatro casos
        en los que la regla se invierte y porque el error no se nota hasta que
        ya pasaron meses cobrando de más —o de menos, que es peor—.
      </P>

      <H2 id="regla">La regla general: 8% de impuesto al consumo</H2>

      <Norma fuente="Estatuto Tributario, artículo 512-9" url={ART_512_9}>
        «La base gravable […] está conformada por el precio total de consumo,
        incluidas las bebidas acompañantes de todo tipo y demás valores
        adicionales. […] La tarifa aplicable al servicio es del ocho por ciento
        (8%) sobre todo consumo.»
      </Norma>

      <P>
        Dos consecuencias que se suelen escribir mal en el sistema: las bebidas{" "}
        <Fuerte>entran</Fuerte> en la base —no se separan para cobrarles IVA— y
        los «demás valores adicionales» también, así que un cubierto o un
        servicio de mesa forman parte de la base gravable.
      </P>

      <Aparte titulo="La propina queda afuera">
        El mismo artículo lo dice: la propina, por ser voluntaria, no hace parte
        de la base gravable del impuesto al consumo. Va aparte del subtotal y no
        lleva impuesto. Lo desarrollamos en la{" "}
        <A href="/guias/propina-en-colombia">guía de la Ley 1935</A>.
      </Aparte>

      <H2 id="iva">Cuándo sí es IVA del 19%</H2>

      <P>
        La excepción está en el mismo artículo y es la que más plata mueve:{" "}
        <Fuerte>las franquicias</Fuerte>.
      </P>

      <Norma
        fuente="Estatuto Tributario, artículo 512-9, parágrafo"
        url={ART_512_9}
      >
        «Lo dispuesto en el presente artículo no se aplicable [sic] a los
        establecimientos de comercio, locales o negocios en donde se desarrollen
        actividades bajo franquicia, concesión, regalía, autorización o
        cualquier otro sistema que implique la explotación de intangibles, los
        cuales estarán gravados con la tarifa general del impuesto sobre las
        ventas.»
      </Norma>

      <P>
        Si tu local opera bajo una marca ajena con contrato de franquicia,
        concesión o regalías, no cobrás el 8%: cobrás{" "}
        <Fuerte>IVA del 19%</Fuerte>. A cambio, y esto es lo que compensa, sí
        podés descontar el IVA de tus compras.
      </P>

      <H2 id="descontable">
        El 8% no es descontable, y por eso no se compara con el 19%
      </H2>

      <P>
        Es la diferencia estructural entre los dos y la razón por la que un
        restaurante bajo franquicia no está «pagando más impuestos» que uno
        normal.
      </P>

      <Norma fuente="Estatuto Tributario, artículo 512-1" url={ART_512_1}>
        «El impuesto nacional al consumo constituye para el comprador un costo
        deducible del impuesto sobre la renta como mayor valor del bien o
        servicio adquirido y no genera impuestos descontables en el impuesto
        sobre las ventas (IVA).»
      </Norma>

      <Tabla
        encabezados={["", "Impuesto al consumo", "IVA"]}
        filas={[
          ["Tarifa en restaurantes", "8%", "19% (solo franquicias)"],
          [
            "¿Descontás el de tus compras?",
            "No. Es un costo.",
            "Sí, se descuenta del que cobrás.",
          ],
          [
            "Declaración",
            "Bimestral, formulario 310",
            "Bimestral o cuatrimestral, formulario 300",
          ],
          [
            "Para el cliente",
            "Mayor valor del servicio",
            "Descontable si es responsable de IVA",
          ],
        ]}
      />

      <H2 id="no-responsable">Quién no está obligado a cobrarlo</H2>

      <P>
        El artículo 512-13 define al <Fuerte>no responsable</Fuerte> del
        impuesto al consumo. Son dos condiciones y hay que cumplir las dos a la
        vez:
      </P>

      <Lista
        items={[
          <>
            Ser <Fuerte>persona natural</Fuerte> —una sociedad nunca puede ser
            no responsable—.
          </>,
          <>
            Que los ingresos brutos del <Fuerte>año anterior</Fuerte>,
            provenientes de la actividad, hayan sido inferiores a{" "}
            <Fuerte>3.500 UVT</Fuerte>.
          </>,
        ]}
      />

      <P>
        El valor en pesos cambia todos los años, porque la UVT se reajusta: hay
        que multiplicar 3.500 por la UVT del año que corresponda, que publica la{" "}
        <A href="https://www.dian.gov.co/">DIAN</A> a fin de cada año. Por eso
        acá no ponemos la cifra: cualquier número en pesos que escribamos queda
        mal en enero.
      </P>

      <H3>Y hay un tercer requisito que se olvida</H3>

      <P>
        Tampoco puede tener <Fuerte>más de un establecimiento</Fuerte> de
        comercio, sede, local o negocio donde ejerza la actividad. Abrir la
        segunda sede cambia la obligación, aunque los ingresos sigan por debajo
        del tope.
      </P>

      <H2 id="excluidos">Lo que no entra en la base</H2>

      <P>
        Los alimentos excluidos del IVA que se vendan{" "}
        <Fuerte>sin transformación ni preparación adicional</Fuerte> no forman
        parte de la base gravable. Es el caso del restaurante que además revende
        un producto tal como lo compró: eso no es servicio de restaurante y no
        se grava con el 8%.
      </P>

      <H2 id="sistema">Cómo tiene que estar hecho el sistema</H2>

      <P>
        Tres cosas que parecen detalles de implementación y que en realidad
        deciden si tus facturas pasan o se rechazan:
      </P>

      <Lista
        items={[
          <>
            <Fuerte>La tarifa se congela en cada renglón vendido</Fuerte>, no se
            lee del producto al reimprimir. Si el año que viene la tarifa cambia
            y reimprimís un recibo de hoy leyendo la tarifa actual, ese recibo
            declara una venta vieja con el impuesto de mañana.
          </>,
          <>
            <Fuerte>El redondeo va por línea, nunca sobre el total.</Fuerte> Es
            la diferencia entre que la suma de los renglones dé exactamente el
            total de la factura o que quede descuadrada por unos pesos, que es
            lo que hace que un documento se rechace.
          </>,
          <>
            <Fuerte>
              El sistema tiene que distinguir IVA de impuesto al consumo
            </Fuerte>
            , no guardar «el impuesto» a secas. La DIAN los identifica con
            códigos distintos —<code className="font-mono text-sm">01</code>{" "}
            para IVA, <code className="font-mono text-sm">04</code> para
            consumo— y mandar el que no es rechaza el documento.
          </>,
        ]}
      />

      <P>
        Esa última es la que más veces está mal, porque en pantalla se ve
        idéntica: el cliente paga lo mismo y la tirilla dice lo mismo. La
        diferencia aparece recién cuando el documento llega a la DIAN, con
        alguien esperando en la caja. Lo contamos en la{" "}
        <A href="/guias/factura-electronica-dian-para-restaurantes">
          guía de facturación electrónica
        </A>
        .
      </P>

      <Aparte titulo="Ojo con esto">
        Nada de lo de arriba reemplaza a tu contador. El impuesto al consumo
        tiene casos particulares —bares y discotecas, catering, comida por
        contrato— que dependen de cómo esté constituido tu negocio. Lo que sí
        podemos afirmar es la mecánica: qué campos tiene que guardar el sistema
        para que la declaración y la factura digan lo mismo.
      </Aparte>
    </>
  );
}
