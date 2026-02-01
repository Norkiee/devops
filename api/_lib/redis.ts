import Redis from 'ioredis';

let client: Redis | null = null;

function getClient(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('Missing REDIS_URL environment variable');
    }
    client = new Redis(url);
  }
  return client;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const redis = getClient();
  const value = await redis.get(key);
  if (!value) return null;
  return JSON.parse(value) as T;
}

export async function kvSet(
  key: string,
  value: unknown,
  expirySeconds?: number
): Promise<void> {
  const redis = getClient();
  const serialized = JSON.stringify(value);
  if (expirySeconds) {
    await redis.set(key, serialized, 'EX', expirySeconds);
  } else {
    await redis.set(key, serialized);
  }
}

export async function kvDel(key: string): Promise<void> {
  const redis = getClient();
  await redis.del(key);
}
