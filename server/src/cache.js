import Redis from 'ioredis';
import crypto from 'node:crypto';

const noopLogger = (msg) => console.warn(msg);

class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    const { value, expireAt } = entry;
    if (expireAt && expireAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return value;
  }

  async set(key, value, ttlSeconds) {
    const expireAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expireAt });
  }

  async del(key) {
    this.store.delete(key);
  }

  async incr(key, ttlSeconds) {
    const val = (await this.get(key)) || 0;
    const next = Number(val) + 1;
    await this.set(key, next, ttlSeconds);
    return next;
  }
}

const createCache = () => {
  const url = process.env.REDIS_URL;
  if (!url) {
    return { client: new MemoryCache(), kind: 'memory' };
  }
  const redis = new Redis(url, { lazyConnect: true });
  redis.on('error', () => {});
  redis.connect().catch(() => {});
  const client = {
    async get(key) {
      return redis.get(key);
    },
    async set(key, value, ttlSeconds) {
      if (ttlSeconds) {
        await redis.set(key, value, 'EX', ttlSeconds);
      } else {
        await redis.set(key, value);
      }
    },
    async del(key) {
      await redis.del(key);
    },
    async incr(key, ttlSeconds) {
      const next = await redis.incr(key);
      if (ttlSeconds) {
        await redis.expire(key, ttlSeconds);
      }
      return next;
    }
  };
  return { client, kind: 'redis' };
};

const { client: cacheClient, kind } = createCache();

const sessionKey = (sessionId) => `session:${sessionId}`;
const idempotencyKey = (key) => `idem:${crypto.createHash('sha256').update(key).digest('hex')}`;
const throttleKey = (key) => `throttle:${key}`;

const sessionStore = {
  async save(sessionId, payload, ttlSeconds) {
    await cacheClient.set(sessionKey(sessionId), JSON.stringify(payload), ttlSeconds);
  },
  async load(sessionId) {
    const raw = await cacheClient.get(sessionKey(sessionId));
    return raw ? JSON.parse(raw) : null;
  },
  async drop(sessionId) {
    await cacheClient.del(sessionKey(sessionId));
  }
};

const idem = async (key, ttlSeconds = 120) => {
  const cacheId = idempotencyKey(key);
  const exists = await cacheClient.get(cacheId);
  if (exists) return false;
  await cacheClient.set(cacheId, '1', ttlSeconds);
  return true;
};

const throttle = async (key, limit, ttlSeconds = 60) => {
  const hits = await cacheClient.incr(throttleKey(key), ttlSeconds);
  return hits <= limit;
};

export { cacheClient, kind as cacheKind, sessionStore, idem, throttle };
