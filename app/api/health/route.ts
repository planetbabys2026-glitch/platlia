import { pool } from "@/lib/db/pool";

// Nunca prerenderizar: el sentido de esta ruta es reflejar el estado de AHORA.
export const dynamic = "force-dynamic";

/**
 * Health check para el monitoreo externo y para verificar el despliegue.
 * Devuelve 503 si la base de datos no responde, para que el monitor lo detecte.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    await pool.query("select 1");
    return Response.json({
      status: "ok",
      db: "ok",
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[health] la base de datos no respondió", error);
    return Response.json(
      {
        status: "error",
        db: "unreachable",
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}
