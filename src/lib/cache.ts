/* eslint-disable @typescript-eslint/no-empty-function */
import { type RedisClientType, createClient } from 'redis';

export type Classification = { class: string; subclass: string };

const KEY_PREFIX = 'pathway:cls:v1:';
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const inMemory = new Map<string, Classification>();

let redisClient: RedisClientType | null = null;
let redisReady = false;

async function getRedis(): Promise<RedisClientType | null> {
  if (redisReady && redisClient) return redisClient;
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  try {
    if (!redisClient) {
      redisClient = createClient({ url });
      redisClient.on('error', () => {});
    }
    if (!redisReady) {
      await redisClient.connect();
      redisReady = true;
    }
    return redisClient;
  } catch {
    return null;
  }
}

function makeKey(pathwayName: string): string {
  return KEY_PREFIX + encodeURIComponent(pathwayName.trim());
}

async function redisMGet(client: RedisClientType, keys: string[]) {
  if (keys.length === 0) return [] as (string | null)[];
  return (await client.mGet(keys)) as (string | null)[];
}

export const classificationCache = {
  clearMemory() {
    inMemory.clear();
  },

  async get(pathwayName: string): Promise<Classification | undefined> {
    const mem = inMemory.get(pathwayName);
    if (mem) return mem;
    const redis = await getRedis();
    if (!redis) return undefined;
    const key = makeKey(pathwayName);
    try {
      const raw = await redis.get(key);
      if (!raw) return undefined;
      const cached = JSON.parse(raw) as Classification;
      inMemory.set(pathwayName, cached);
      return cached;
    } catch {
      return undefined;
    }
  },

  async getMany(
    pathwayNames: string[]
  ): Promise<Record<string, Classification | undefined>> {
    const result: Record<string, Classification | undefined> = {};
    const toFetch: string[] = [];
    const nameByKey: Record<string, string> = {};

    for (const name of pathwayNames) {
      const mem = inMemory.get(name);
      if (mem) {
        result[name] = mem;
      } else {
        const key = makeKey(name);
        nameByKey[key] = name;
        toFetch.push(key);
      }
    }

    if (toFetch.length > 0) {
      const redis = await getRedis();
      if (redis) {
        try {
          const fetched = await redisMGet(redis, toFetch);
          fetched.forEach((raw, idx) => {
            const key = toFetch[idx];
            const name = nameByKey[key];
            if (raw) {
              try {
                const val = JSON.parse(raw) as Classification;
                inMemory.set(name, val);
                result[name] = val;
              } catch {
                result[name] = undefined;
              }
            } else {
              result[name] = undefined;
            }
          });
        } catch {
          // ignore
        }
      }
    }

    return result;
  },

  async set(pathwayName: string, value: Classification): Promise<void> {
    inMemory.set(pathwayName, value);
    const redis = await getRedis();
    if (!redis) return;
    const key = makeKey(pathwayName);
    try {
      await redis.set(key, JSON.stringify(value), { EX: TTL_SECONDS });
    } catch {
      // ignore
    }
  },

  async setMany(
    entries: Array<{ pathwayName: string; value: Classification }>
  ) {
    entries.forEach(({ pathwayName, value }) =>
      inMemory.set(pathwayName, value)
    );
    const redis = await getRedis();
    if (!redis) return;
    await Promise.all(
      entries.map(({ pathwayName, value }) =>
        redis.set(makeKey(pathwayName), JSON.stringify(value), {
          EX: TTL_SECONDS,
        })
      )
    );
  },
};
