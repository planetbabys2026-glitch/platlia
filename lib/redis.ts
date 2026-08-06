import Redis from "ioredis";
import { env } from "@/lib/env";

declare global {
  var __redisPublisher: Redis | undefined;
}

function createRedisInstance(): Redis | null {
  if (!env.REDIS_URL) return null;
  try {
    return new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
    });
  } catch {
    return null;
  }
}

export function getRedisPublisher(): Redis | null {
  if (!env.REDIS_URL) return null;

  if (!globalThis.__redisPublisher) {
    const client = createRedisInstance();
    if (client) {
      void client.connect().catch(() => {});
    }
    globalThis.__redisPublisher = client ?? undefined;
  }
  return globalThis.__redisPublisher ?? null;
}

export function createRedisSubscriber(): Redis | null {
  const client = createRedisInstance();
  if (client) {
    void client.connect().catch(() => {});
  }
  return client;
}

/**
 * Publica un evento de actualización del turnero para una sucursal en Redis Pub/Sub.
 *
 * Si Redis no está configurado o falla la conexión, la función se completa silenciosamente
 * sin interrumpir la Server Action.
 */
export async function publishTurneroUpdate(businessId: string): Promise<void> {
  const pub = getRedisPublisher();
  if (!pub) return;

  try {
    const channel = `turnero:${businessId}`;
    await pub.publish(channel, JSON.stringify({ type: "update", timestamp: Date.now() }));
  } catch {
    // Falla tolerante: si Redis Pub/Sub no responde, la app sigue funcionando.
  }
}

/**
 * Publica un evento de actualización de la pantalla de cocina para una sucursal en Redis Pub/Sub.
 */
export async function publishCocinaUpdate(businessId: string): Promise<void> {
  const pub = getRedisPublisher();
  if (!pub) return;

  try {
    const channel = `cocina:${businessId}`;
    await pub.publish(channel, JSON.stringify({ type: "update", timestamp: Date.now() }));
  } catch {
    // Falla tolerante: si Redis Pub/Sub no responde, la app sigue funcionando.
  }
}
