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

export function CostoPorPlato() {
  return (
    <>
      <P>
        Casi todo restaurante sabe cuánto vende. Muchos menos saben cuánto{" "}
        <Fuerte>gana</Fuerte>, y la diferencia entre las dos cosas se esconde en
        dos errores de aritmética que hacen que un plato que pierde plata
        parezca rentable durante toda una temporada.
      </P>

      <H2 id="dos-regimenes">Antes de costear: qué tipo de producto es</H2>

      <P>
        Hay dos maneras de medir un producto, y son excluyentes. Contarlo de las
        dos es el error que más descuadra un inventario.
      </P>

      <Tabla
        encabezados={["", "Reventa", "Por receta"]}
        filas={[
          [
            "Qué es",
            "Una cerveza: se compra y se vende igual",
            "Un plato: se prepara",
          ],
          ["Dónde está el stock", "En el producto mismo", "En cada insumo"],
          [
            "Cuál es el costo",
            "Lo que te costó la unidad",
            "La suma de su receta",
          ],
          [
            "Al vender, descuenta",
            "Una unidad del producto",
            "Cada insumo de la receta",
          ],
        ]}
      />

      <Aparte titulo="El bug clásico">
        Crear un plato y además un insumo espejo con el mismo nombre, unidos por
        una receta de 1 a 1. La venta descuenta uno solo y la compra sube los
        dos, así que el insumo espejo trepa para siempre y la valorización del
        inventario infla el patrimonio del negocio sin techo. Un producto se
        mide de una de las dos maneras, nunca de las dos.
      </Aparte>

      <H2 id="promedio">Error 1: dejar que la última compra pise el costo</H2>

      <P>
        Tenés veinte cervezas que te costaron $2.000. Un martes conseguís diez
        más, pero a $2.600. ¿Cuánto te cuesta ahora una cerveza?
      </P>

      <P>
        Si el sistema escribe el costo de la última compra, la respuesta es
        $2.600 — y acabás de{" "}
        <Fuerte>reevaluar las veinte que ya estaban en la nevera</Fuerte>, que
        te costaron $2.000. Tu inventario vale más de lo que pagaste y tu margen
        se ve peor de lo que es.
      </P>

      <P>Lo correcto es el promedio ponderado:</P>

      <Aparte titulo="La cuenta">
        (20 × $2.000 + 10 × $2.600) ÷ 30 = $2.200 por unidad. Ni el precio viejo
        ni el nuevo: el que de verdad tenés puesto en la nevera.
      </Aparte>

      <H3>Dos casos que no son promedio</H3>

      <Lista
        items={[
          <>
            <Fuerte>Sin costo previo</Fuerte> se adopta el entrante entero. Un
            cero casi nunca significa «me lo regalaron»; significa «nadie le
            puso precio», y promediar contra ese cero arrastra el costo a la
            mitad.
          </>,
          <>
            <Fuerte>Con el stock en cero o negativo</Fuerte> no hay nada que
            ponderar del lado viejo. Se toma el nuevo.
          </>,
        ]}
      />

      <H2 id="neto">Error 2: costear con el impuesto adentro</H2>

      <P>
        Si tu factura de compra viene con IVA y guardás ese número como costo,
        estás inflando el costo. Y si además comparás ese costo contra el precio
        de venta con impuesto incluido, tenés dos impuestos distintos en la
        misma división y el porcentaje que sale no significa nada.
      </P>

      <P>
        La regla es <Fuerte>base contra base</Fuerte>: el costo se guarda neto
        de impuesto y el margen se compara contra la base gravable de la venta,
        no contra el total que paga el cliente.
      </P>

      <Aparte titulo="Por qué importa tanto">
        El impuesto lo cobrás para entregarlo. Contarlo como ingreso propio
        infla el margen del negocio entero, y no un poco: con impuesto al
        consumo del 8%, un margen real del 60% se ve como 63%. Sobre esa base se
        toman decisiones de precio que estaban mal desde el principio.
      </Aparte>

      <H2 id="congelado">El costo se congela al vender</H2>

      <P>
        Esta es la que casi nadie implementa y la que decide si tus informes
        históricos sirven.
      </P>

      <P>
        Si el costo de una venta de marzo se reconstruye cruzando el renglón con
        la receta <Fuerte>actual</Fuerte>, entonces el informe de marzo{" "}
        <Fuerte>cambia</Fuerte> cada vez que un proveedor sube un precio en
        diciembre. El margen del primer trimestre se mueve solo, hacia atrás, y
        no hay forma de comparar dos meses entre sí.
      </P>

      <P>
        El costo unitario tiene que escribirse en el renglón{" "}
        <Fuerte>en el momento de la venta</Fuerte>, junto con la tarifa de
        impuesto, por la misma razón. Un informe viejo tiene que decir siempre
        lo mismo.
      </P>

      <H2 id="nulo">«Sin costo» no es «costo cero»</H2>

      <P>
        Un producto que nadie costeó no tiene costo $0: tiene costo{" "}
        <Fuerte>desconocido</Fuerte>. La diferencia parece de forma y es la más
        importante de todas.
      </P>

      <P>
        Con costo cero, el sistema calcula un margen del 100% y lo muestra como
        si fuera una buena noticia. Con costo desconocido, el sistema puede
        decir «12 de 45 renglones sin costo» y avisar que la cifra todavía no es
        confiable. Lo primero es una mentira que celebra; lo segundo es un
        informe.
      </P>

      <H2 id="food-cost">Qué mirar, y contra qué</H2>

      <ListaNumerada
        items={[
          <>
            <Fuerte>Food cost por plato</Fuerte> = costo de la receta ÷ precio
            de venta sin impuesto. En cocina suele buscarse entre 25% y 35%,
            aunque depende del tipo de local.
          </>,
          <>
            <Fuerte>Margen de contribución</Fuerte> = precio sin impuesto −
            costo. En pesos, no en porcentaje: un plato con 70% de margen sobre
            $8.000 deja menos que uno con 50% sobre $30.000.
          </>,
          <>
            <Fuerte>Contribución total por plato</Fuerte> = margen × unidades
            vendidas. Es lo que de verdad ordena la carta, porque cruza
            rentabilidad con demanda.
          </>,
        ]}
      />

      <P>
        Esa tercera es la que cambia decisiones. El plato más rentable de la
        carta no sirve de nada si se vende una vez por semana, y el que menos
        margen deja puede ser el que paga el arriendo.
      </P>

      <H2 id="mermas">Lo que la receta no dice</H2>

      <P>
        El costo teórico de la receta siempre va a ser menor que el real, porque
        no incluye la merma, el desperdicio, lo que se cae, lo que se regala ni
        lo que se roba. La forma de verlo no es adivinar un porcentaje: es{" "}
        <Fuerte>comparar el consumo teórico contra el conteo físico</Fuerte>.
      </P>

      <P>
        Para eso el inventario tiene que permitir stock{" "}
        <Fuerte>negativo</Fuerte>. Suena a error y es exactamente lo contrario:
        si el sistema clava en cero lo que ya se agotó, esconde el faltante
        justo cuando aparece. El negativo es la señal.
      </P>

      <P>
        Y para que esa comparación sea posible, cada movimiento —compra, venta,
        ajuste— tiene que dejar rastro con el saldo que quedó después. Sin eso,
        cuando el conteo no cuadra no hay nada que revisar.
      </P>

      <P>
        Si además querés que los números de costo y los de venta cuadren con lo
        que declarás, conviene tener clara la diferencia entre{" "}
        <A href="/guias/impuesto-al-consumo-o-iva-en-restaurantes">
          impuesto al consumo e IVA
        </A>
        : es el impuesto que hay que sacar de los dos lados antes de dividir.
      </P>
    </>
  );
}
