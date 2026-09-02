import { autenticar } from "@/lib/mcp/token";
import { env } from "@/lib/env";
import { HERRAMIENTAS, HERRAMIENTA_POR_NOMBRE } from "@/lib/mcp/herramientas";

/**
 * El punto por el que la IA de un negocio consulta su información.
 *
 * Habla JSON-RPC 2.0, que es lo que pide el Model Context Protocol, y se
 * implementa a mano en vez de con el SDK: son tres métodos —`initialize`,
 * `tools/list` y `tools/call`— y el SDK trae su propio manejo de transporte que
 * pelea con el ciclo de vida de una ruta de Next. Menos de lo que ocuparía
 * adaptarlo, y una dependencia menos en el arranque.
 *
 * **La sesión no existe acá.** Es el mismo caso del webhook de MercadoPago y del
 * agente de impresión: quien llama no es un navegador y no va a tener cookie. Se
 * autentica con el token en cada pedido, y el `businessId` sale de ese token —
 * nunca de algo que mande el cliente—. Esa es toda la separación entre un
 * negocio y otro, así que no hay un solo camino en este archivo donde el
 * `businessId` venga de los argumentos.
 */

export const dynamic = "force-dynamic";

/**
 * Las versiones del protocolo que sabemos hablar, de la más nueva a la más vieja.
 *
 * Nuestra superficie son tres métodos y herramientas de solo lectura, que no
 * cambiaron entre estas revisiones, así que se acepta la que pida el cliente. Con
 * una sola fija —estaba en la de 2024— un cliente actual pide la suya, se le
 * contesta otra, y algunos cortan ahí en vez de seguir.
 */
const VERSIONES = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const VERSION_PROTOCOLO = VERSIONES[0];

type Peticion = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

function respuesta(id: Peticion["id"], resultado: unknown) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result: resultado });
}

function error(id: Peticion["id"], codigo: number, mensaje: string, http = 200) {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code: codigo, message: mensaje } },
    { status: http },
  );
}

export async function POST(req: Request) {
  // Autenticar toca la base, y si la base no contesta se cae acá — antes de todo
  // el manejo de errores de abajo. Sin este catch, del lado del asistente eso se
  // ve como un error de red y manda a revisar el token, que es lo único que no
  // está mal.
  let negocio: Awaited<ReturnType<typeof autenticar>>;
  try {
    negocio = await autenticar(req.headers.get("authorization"));
  } catch (e) {
    console.error("[mcp] no se pudo verificar el token:", e);
    return error(null, -32603, "El servicio no está disponible en este momento.", 503);
  }
  if (negocio === "TOKEN") {
    /**
     * Este 401 es el que arranca todo.
     *
     * Un cliente moderno no pide un token: pega acá sin credencial a propósito y
     * lee de esta cabecera dónde está el documento que le dice a qué servidor ir a
     * pedir permiso. Sin `resource_metadata` no hay descubrimiento, y el cliente
     * termina adivinando `/authorize` —que fue exactamente lo que pasó.
     */
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Token inválido o revocado." } },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer realm="Platlia", resource_metadata="${env.APP_URL}/.well-known/oauth-protected-resource"`,
        },
      },
    );
  }

  if (negocio === "LICENCIA") {
    // 403 y no 401: el token está bien, y volver a emitirlo no arregla nada. Acá
    // sí se dice cuál es el problema, al revés que en el menú QR —allá el que lee
    // es un comensal y enterarlo expondría al negocio delante de su cliente; acá
    // el que lee es el dueño, que es justamente quien puede resolverlo.
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32002,
          message: "La licencia de este negocio no está vigente. Se reactiva al ponerse al día.",
        },
      },
      { status: 403 },
    );
  }

  // A `const` después de las guardas: el narrowing de un `let` asignado dentro de
  // un `try` no llega hasta el fondo de la función.
  const autenticado = negocio;

  let peticion: Peticion;
  try {
    peticion = (await req.json()) as Peticion;
  } catch {
    return error(null, -32700, "El cuerpo no es JSON válido.", 400);
  }

  const { id, method, params } = peticion;

  if (method === "initialize") {
    return respuesta(id, {
      // Se devuelve la que pidió si la sabemos hablar; si no, la nuestra, que es
      // lo que el protocolo manda hacer para que el cliente decida si sigue.
      protocolVersion: (VERSIONES as readonly string[]).includes(String(params?.protocolVersion))
        ? String(params?.protocolVersion)
        : VERSION_PROTOCOLO,
      capabilities: { tools: {} },
      serverInfo: { name: "platlia", version: "1.0.0" },
      instructions:
        "Información del negocio en Platlia. Todo es de solo lectura y agregado: no hay datos de comensales " +
        "—nombres, teléfonos ni direcciones—, y ninguna herramienta puede cobrar, anular ni modificar nada. " +
        "El día de negocio no termina a medianoche: usá `jornada_actual` si necesitás saber el corte antes de " +
        "interpretar una cifra. Los montos están en pesos colombianos.",
    });
  }

  // Los avisos no llevan respuesta: contestar a uno rompe a algunos clientes.
  if (method.startsWith("notifications/")) return new Response(null, { status: 202 });

  if (method === "tools/list") {
    return respuesta(id, {
      tools: HERRAMIENTAS.map((h) => ({
        name: h.nombre,
        description: h.descripcion,
        inputSchema: h.esquema,
      })),
    });
  }

  if (method === "tools/call") {
    const nombre = typeof params?.name === "string" ? params.name : "";
    const herramienta = HERRAMIENTA_POR_NOMBRE.get(nombre);
    if (!herramienta) return error(id, -32602, `No existe la herramienta "${nombre}".`);

    const args = (params?.arguments ?? {}) as Record<string, unknown>;

    try {
      // `businessId` sale del TOKEN, nunca de `args`: es lo único que separa la
      // información de un negocio de la de otro.
      const texto = await herramienta.ejecutar(autenticado.businessId, args);
      return respuesta(id, { content: [{ type: "text", text: texto }] });
    } catch (e) {
      // El detalle va al log, no a la respuesta: del otro lado hay un modelo que
      // va a repetir lo que reciba, y un error de Prisma le contaría a quien
      // pregunte cómo está hecha la base.
      console.error(`[mcp] ${nombre} falló para ${autenticado.businessId}:`, e);
      return respuesta(id, {
        content: [{ type: "text", text: "No se pudo consultar esa información en este momento." }],
        isError: true,
      });
    }
  }

  return error(id, -32601, `Método no soportado: ${method}.`);
}

/**
 * En este transporte, `GET` es cómo un cliente abre el canal por el que el
 * servidor le habla a él, y hay que contestar **405** cuando no se ofrece.
 *
 * Acá no se ofrece a propósito: las herramientas son todas de solo lectura y
 * contestan en el momento, así que no hay nada que empujar. Antes esto devolvía un
 * 200 con un JSON descriptivo, que es peor que no contestar: el cliente pide un
 * flujo de eventos, recibe otra cosa con código de éxito, y se queda esperando.
 */
export async function GET() {
  return new Response(null, { status: 405, headers: { allow: "POST, OPTIONS" } });
}

/** El navegador pregunta antes de un POST con cabecera propia. */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, mcp-protocol-version",
    },
  });
}
