import { autenticarAgente } from "@/lib/printing/agente";
import { marcarFallo, marcarImpreso, reclamarTrabajos } from "@/lib/printing/cola";
import { avisarFalloDeImpresion } from "@/lib/printing/avisos";
import { tenantDb } from "@/lib/db/tenant";

/**
 * La puerta del agente de impresión.
 *
 * `GET` entrega trabajos y se los reserva; `POST` confirma qué salió y qué no.
 * Es una ruta pública en el `middleware` porque el agente no tiene cookie —no es
 * un navegador—, pero **se autentica por su cuenta**: estar en la lista de rutas
 * públicas no autentica nada, igual que el webhook de MercadoPago.
 *
 * Todo lo que toca va por `tenantDb(businessId del token)`, nunca por `rootDb`:
 * un token filtrado no puede leer la cola de otro negocio.
 */
export const dynamic = "force-dynamic";

function noAutorizado() {
  return Response.json({ error: "No autorizado" }, { status: 401 });
}

/** El agente viene a buscar trabajo. */
export async function GET(req: Request) {
  const agente = await autenticarAgente(req.headers.get("authorization"));
  if (!agente) return noAutorizado();

  const db = tenantDb(agente.businessId);
  const trabajos = await reclamarTrabajos(db, agente.agenteId);

  return Response.json({ trabajos });
}

/**
 * El agente cuenta cómo le fue.
 *
 * Se acepta un lote: el agente puede haber impreso tres comandas de una tanda y
 * no tiene sentido que haga tres viajes.
 */
export async function POST(req: Request) {
  const agente = await autenticarAgente(req.headers.get("authorization"));
  if (!agente) return noAutorizado();

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo ilegible" }, { status: 400 });
  }

  const resultados = (cuerpo as { resultados?: unknown })?.resultados;
  if (!Array.isArray(resultados)) {
    return Response.json({ error: "Falta `resultados`" }, { status: 400 });
  }

  const db = tenantDb(agente.businessId);
  let impresos = 0;
  const agotados: string[] = [];

  for (const bruto of resultados.slice(0, 50)) {
    const item = bruto as { jobId?: unknown; ok?: unknown; error?: unknown };
    if (typeof item?.jobId !== "string") continue;

    if (item.ok === true) {
      if (await marcarImpreso(db, item.jobId, agente.agenteId)) impresos++;
      continue;
    }

    const error = typeof item.error === "string" ? item.error : "Error desconocido";
    const fallo = await marcarFallo(db, item.jobId, agente.agenteId, error);
    // Se agotaron los reintentos: dejar de intentar en silencio sería un cliente
    // esperando un papel que nadie sabe que no salió.
    if (fallo?.agotado) agotados.push(item.jobId);
  }

  for (const jobId of agotados) {
    await avisarFalloDeImpresion(agente.businessId, jobId);
  }

  return Response.json({ impresos, agotados: agotados.length });
}
