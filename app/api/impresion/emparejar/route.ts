import { emparejar } from "@/lib/printing/agente";

/**
 * El canje: un código de emparejamiento a cambio del token de verdad.
 *
 * Lo llama el programa la primera vez que arranca, con el código que sacó del
 * nombre de su propio archivo. A partir de ahí guarda el token y no vuelve a
 * pasar por acá.
 *
 * El código es de un solo uso y se vence en una hora. Esas dos cosas son las que
 * permiten que sea corto y legible: doce caracteres no aguantarían días de fuerza
 * bruta, pero sí una ventana de una hora contra un índice único —y encima se quema
 * apenas se usa—.
 *
 * Ruta pública, como el resto de `/api/impresion/`: quien la llama todavía no
 * tiene ningún secreto con el cual autenticarse. Eso es justamente lo que viene a
 * buscar.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo ilegible" }, { status: 400 });
  }

  const codigo = (cuerpo as { codigo?: unknown })?.codigo;
  if (typeof codigo !== "string" || codigo.trim() === "") {
    return Response.json({ error: "Falta el código" }, { status: 400 });
  }

  const resultado = await emparejar(codigo);
  if (!resultado) {
    // Un mensaje solo, para las tres causas: código inexistente, vencido o ya
    // usado. Distinguirlas le diría a quien esté probando códigos cuál de sus
    // intentos estuvo cerca.
    return Response.json(
      { error: "Ese código no sirve. Puede estar vencido o ya usado: pedí uno nuevo desde Platlia." },
      { status: 404 },
    );
  }

  return Response.json({ token: resultado.token, nombre: resultado.nombre });
}
