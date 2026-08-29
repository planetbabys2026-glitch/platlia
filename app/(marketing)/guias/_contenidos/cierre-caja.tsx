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

export function CierreDeCaja() {
  return (
    <>
      <P>
        Un bar que cierra a las tres de la mañana tiene un problema que un
        restaurante de almuerzos no tiene:{" "}
        <Fuerte>su noche cruza la medianoche</Fuerte>. Y casi todo el software
        de punto de venta corta el día a las 00:00, porque así lo hace el
        calendario.
      </P>

      <P>
        El resultado es que la noche del viernes queda repartida entre viernes y
        sábado. El informe del viernes muestra media noche. El del sábado
        muestra la otra mitad de la del viernes más la mitad de la del sábado.
        Ninguno de los dos coincide con lo que había en la caja cuando se cerró,
        y nadie sabe por qué.
      </P>

      <H2 id="jornada">La jornada de negocio no es el día del calendario</H2>

      <P>
        La solución es vieja y conocida en hotelería y en retail nocturno:
        definir una <Fuerte>jornada de negocio</Fuerte> que empieza a una hora
        que vos elegís —típicamente entre las 4 y las 6 de la mañana— y termina
        a esa misma hora del día siguiente.
      </P>

      <Tabla
        encabezados={[
          "Venta",
          "Con corte a medianoche",
          "Con jornada que empieza 5 a.m.",
        ]}
        filas={[
          ["Viernes 21:30", "Viernes", "Viernes"],
          ["Sábado 01:45", "Sábado", "Viernes"],
          ["Sábado 02:50", "Sábado", "Viernes"],
          ["Sábado 12:30", "Sábado", "Sábado"],
        ]}
      />

      <P>
        Con esto, «la noche del viernes» es una sola cosa: todo lo que se vendió
        desde que abriste hasta que cerraste, sin importar en qué lado de las
        doce cayó. La madrugada pertenece a la jornada anterior, que es como lo
        cuenta cualquiera que trabaje en un bar.
      </P>

      <Aparte titulo="Es un parámetro, no una constante">
        La hora de corte tiene que poder configurarse por negocio. Un bar que
        cierra a las 4 a.m. necesita el corte a las 5; una panadería que abre a
        las 4 a.m. necesita exactamente lo contrario. Un sistema que trae la
        hora escrita en el código sirve para uno de los dos.
      </Aparte>

      <H2 id="arqueo">El arqueo: qué se cuenta y contra qué</H2>

      <P>
        Cerrar la caja es responder una sola pregunta:{" "}
        <Fuerte>¿lo que hay coincide con lo que debería haber?</Fuerte> Y para
        eso hacen falta cuatro números.
      </P>

      <ListaNumerada
        items={[
          <>
            <Fuerte>La base inicial.</Fuerte> Lo que había al abrir el turno
            para dar cambio. Si no se registra, todo lo demás flota.
          </>,
          <>
            <Fuerte>Las ventas en efectivo del turno.</Fuerte> Solo efectivo: lo
            que entró por tarjeta o transferencia no está en el cajón.
          </>,
          <>
            <Fuerte>Los movimientos de caja.</Fuerte> Los retiros para pagarle
            al proveedor de hielo, los ingresos, los gastos menores. Es la línea
            que más se olvida y la que explica la mayoría de los descuadres.
          </>,
          <>
            <Fuerte>El conteo físico.</Fuerte> Lo que de verdad hay, contado
            billete por billete, antes de mirar cuánto debería haber.
          </>,
        ]}
      />

      <P>
        La diferencia entre el conteo y el esperado es el descuadre. Que sea
        distinto de cero no es una catástrofe; que <Fuerte>no se sepa</Fuerte>{" "}
        sí.
      </P>

      <H3>Contá primero, mirá después</H3>

      <P>
        Un detalle de procedimiento que vale más que cualquier función del
        sistema: quien cierra tiene que contar el efectivo{" "}
        <Fuerte>antes</Fuerte> de ver el total esperado. Si primero ve el
        número, el conteo deja de ser un conteo y pasa a ser una confirmación.
      </P>

      <H2 id="bloqueo">Nada se cierra con cuentas abiertas</H2>

      <P>
        El cierre de turno tiene que <Fuerte>bloquearse</Fuerte> si quedó alguna
        cuenta sin cobrar, y decir cuál por su nombre. Una mesa que se fue sin
        pagar, o un pedido que alguien dejó en espera y se olvidó, es plata que
        falta y que sin este aviso aparece al otro día como un descuadre sin
        explicación.
      </P>

      <P>
        Es la red que hay que tener al final del turno, no un cartel que le
        llene la pantalla al cajero toda la noche.
      </P>

      <H2 id="turnos">Un turno no es un día</H2>

      <P>
        En un local con dos turnos —almuerzo y noche— cada uno tiene su caja, su
        base y su responsable. Si el sistema solo maneja «el día», el faltante
        de la noche se mezcla con el sobrante del almuerzo y desaparece el
        rastro de quién lo tenía.
      </P>

      <Lista
        items={[
          <>
            Cada apertura registra <Fuerte>quién</Fuerte> abrió y con cuánto.
          </>,
          <>Cada cierre registra quién cerró, el conteo y la diferencia.</>,
          <>
            Varios turnos pueden vivir dentro de la misma jornada de negocio, y
            los informes del día los suman.
          </>,
        ]}
      />

      <H2 id="informes">Por qué esto se nota en los informes</H2>

      <P>
        Con la jornada bien definida aparecen respuestas que con el corte a
        medianoche son imposibles:
      </P>

      <Lista
        items={[
          <>
            <Fuerte>A qué hora hay que tener más gente.</Fuerte> Contando por la
            hora en que se abre la mesa y no por la del pago, porque una mesa
            que se sienta a las 9 y paga a la 1 es trabajo de las 9.
          </>,
          <>
            <Fuerte>Cuánto vende un viernes contra otro viernes.</Fuerte> Con la
            noche partida, cada viernes se compara contra mitades distintas.
          </>,
          <>
            <Fuerte>Si el turno de la madrugada se paga solo.</Fuerte> Solo se
            puede responder si esas horas están todas del mismo lado.
          </>,
        ]}
      />

      <P>
        Y una consecuencia técnica para quien esté evaluando sistemas: preguntá
        cómo maneja la jornada. Si la respuesta es «el día empieza a medianoche»
        o «se puede filtrar por rango de horas», no lo maneja — filtrar por
        horas a mano es reconstruir cada noche a mano, todas las noches.
      </P>

      <P>
        Si además vas a facturar electrónicamente, el corte de la jornada y el
        de la numeración son dos cosas distintas y conviene no mezclarlas: lo
        vemos en la{" "}
        <A href="/guias/factura-electronica-dian-para-restaurantes">
          guía de facturación electrónica
        </A>
        .
      </P>
    </>
  );
}
