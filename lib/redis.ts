import Redis from "ioredis";
import type { Aviso } from "@/lib/avisos";
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

/**
 * Publica un evento de actualización del panel de domicilios para una sucursal en Redis Pub/Sub.
 */
export async function publishDomiciliosUpdate(businessId: string): Promise<void> {
  const pub = getRedisPublisher();
  if (!pub) return;

  try {
    const channel = `domicilios:${businessId}`;
    await pub.publish(channel, JSON.stringify({ type: "update", timestamp: Date.now() }));
  } catch {
    // Falla tolerante: si Redis Pub/Sub no responde, la app sigue funcionando.
  }
}

/**
 * Publica un aviso —un pedido que ACABA de llegar a cocina o a domicilios— para
 * que salte en cualquier pantalla de la sucursal, no solo en la que le
 * corresponde.
 *
 * Va por un canal aparte de los tres de arriba a propósito. Esos se publican
 * también cuando cocina marca un plato listo, cuando se renombra una cuenta o
 * cuando se cobra: mueven contadores, no son noticias. Este solo se emite en los
 * tres momentos en que entra un pedido, y por eso puede levantar un toast sin
 * mentir.
 */
export async function publicarAviso(businessId: string, aviso: Aviso): Promise<void> {
  const pub = getRedisPublisher();
  if (!pub) return;

  try {
    await pub.publish(`avisos:${businessId}`, JSON.stringify(aviso));
  } catch {
    // Falla tolerante: sin Redis no hay aviso, pero el pedido ya quedó tomado.
  }
}
