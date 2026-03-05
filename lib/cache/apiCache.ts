type CacheEntry = {
  data: unknown;
  timestamp: number;
  promise?: Promise<unknown>;
};

const store = new Map<string, CacheEntry>();

export const apiCache = {
  get<T>(key: string, ttl = 30_000): T | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttl) {
      store.delete(key);
      return null;
    }
    return entry.data as T;
  },

  set(key: string, data: unknown) {
    store.set(key, { data, timestamp: Date.now() });
  },

  getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttl = 30_000): Promise<T> {
    const cached = this.get<T>(key, ttl);
    if (cached !== null) return Promise.resolve(cached);

    const existing = store.get(key);
    if (existing?.promise) return existing.promise as Promise<T>;

    const promise = fetcher()
      .then((data) => {
        this.set(key, data);
        return data;
      })
      .finally(() => {
        const latest = store.get(key);
        if (latest?.promise) {
          store.delete(key);
        }
      });

    store.set(key, { data: null, timestamp: 0, promise });
    return promise;
  },

  invalidate(keyPrefix: string) {
    Array.from(store.keys()).forEach((key) => {
      if (key.startsWith(keyPrefix)) {
        store.delete(key);
      }
    });
  },
};
