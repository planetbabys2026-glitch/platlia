import { formatTurno } from "@/lib/turns";

/**
 * Los avisos en vivo: lo que salta en pantalla cuando entra un pedido nuevo.
 *
 * Existen porque los canales de Redis que ya había —`cocina:`, `domicilios:`,
 * `turnero:`— no distinguen "entró un pedido" de "cocina marcó un plato listo":
 * su carga útil es `{ type: "update", timestamp }` y se publica desde ocho
 * lugares distintos. Contra eso no se puede escribir "Mesa 5 · Andrés", y
 * recontar y comparar tampoco alcanza: un pedido que entra mientras otro se
 * marca listo da diferencia cero.
 *
 * Módulo puro y sin `server-only`: lo arma el servidor al publicar y lo lee el
 * navegador al recibirlo, y el texto —que alguien va a leer apurado en una
 * cocina— se prueba sin levantar una pantalla.
 */

export type TipoAviso = "COCINA_NUEVA_COMANDA" | "DOMICILIO_NUEVO";

export type Aviso = {
  /** `orderId:tipo:ts`. El cliente descarta repetidos con esto. */
  id: string;
  tipo: TipoAviso;
  orderId: string;
  code: number;
  /** "Mesa 5 · Andrés", "Turno 07", "Domicilio · Camila". */
  titulo: string;
  /** "3 productos", "Cra 45 #12-30". */
  detalle: string;
  /** A dónde lleva el toast. */
  href: string;
  ts: number;
};

export type DatosAviso =
  | {
      tipo: "COCINA_NUEVA_COMANDA";
      orderId: string;
      code: number;
      /** El nombre de la mesa tal como se muestra en el salón, o null si no la hay. */
      mesa: string | null;
      /** La etiqueta de la cuenta: "Andrés", "Cuenta 2". */
      cuenta: string | null;
      turno: number | null;
      productos: number;
      ts?: number;
    }
  | {
      tipo: "DOMICILIO_NUEVO";
      orderId: string;
      code: number;
      cliente: string | null;
      direccion: string | null;
      productos: number;
      ts?: number;
    };

function contarProductos(n: number): string {
  return `${n} ${n === 1 ? "producto" : "productos"}`;
}

/** Vacío y solo espacios cuentan como no escrito. */
function limpio(texto: string | null | undefined): string | null {
  const t = texto?.trim();
  return t ? t : null;
}

/**
 * Arma el aviso que viaja por Redis y se pinta en el toast.
 *
 * El título es lo único que alguien lee de verdad, así que baja por
 * especificidad: mesa con nombre de cuenta, mesa sola, turno, y recién al final
 * el consecutivo del pedido —que no le dice nada a nadie, pero siempre existe—.
 *
 * En cocina no se usa `etiquetaDeCuenta` de `lib/salon/mesa.ts` aunque sea la
 * misma idea: esa función necesita el índice de la cuenta dentro de la mesa, y
 * averiguarlo acá costaría una consulta más por cada comanda enviada. No hace
 * falta: `abrirPedido` ya deja escrito "Cuenta N" al abrir, así que para cuando
 * la comanda se confirma el nombre está puesto.
 */
export function describirAviso(datos: DatosAviso): Aviso {
  const ts = datos.ts ?? Date.now();
  const base = { id: `${datos.orderId}:${datos.tipo}:${ts}`, orderId: datos.orderId, code: datos.code, ts };

  if (datos.tipo === "DOMICILIO_NUEVO") {
    const cliente = limpio(datos.cliente);
    const direccion = limpio(datos.direccion);
    return {
      ...base,
      tipo: "DOMICILIO_NUEVO",
      titulo: cliente ? `Domicilio · ${cliente}` : `Domicilio #${datos.code}`,
      // La dirección manda sobre el conteo: quien mira domicilios necesita saber
      // a dónde va antes que cuántas cosas lleva.
      detalle: direccion ?? contarProductos(datos.productos),
      href: "/domicilios",
    };
  }

  // Misma regla que la tarjeta de cocina (`app/(app)/cocina/comanda.tsx`):
  // primero a dónde va, después de quién es. Conviene que el toast y la comanda
  // se lean igual, porque la misma persona mira las dos.
  //
  // `Table.name` guarda el número pelado ("5", "12"), no "Mesa 5": la palabra la
  // pone quien pinta, acá y en el salón.
  const mesa = limpio(datos.mesa);
  const cuenta = limpio(datos.cuenta);

  const destino = mesa
    ? `Mesa ${mesa}`
    : datos.turno !== null
      ? `Turno ${formatTurno(datos.turno)}`
      : `Pedido #${datos.code}`;

  return {
    ...base,
    tipo: "COCINA_NUEVA_COMANDA",
    titulo: cuenta ? `${destino} · ${cuenta}` : destino,
    detalle: contarProductos(datos.productos),
    href: "/cocina",
  };
}
