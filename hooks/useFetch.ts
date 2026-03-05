"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiCache } from "@/lib/cache/apiCache";

export function useFetch<T>(
  url: string | null,
  options?: { ttl?: number; initialData?: T }
) {
  const ttl = options?.ttl ?? 30_000;
  const [version, setVersion] = useState(0);
  const requestKey = useMemo(
    () => (url ? `${url}${url.includes("?") ? "&" : "?"}__v=${version}` : null),
    [url, version]
  );

  const [data, setData] = useState<T | null>(() =>
    requestKey ? apiCache.get<T>(requestKey, ttl) : (options?.initialData ?? null)
  );
  const [loading, setLoading] = useState<boolean>(!data && !!requestKey);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(requestKey);

  useEffect(() => {
    if (!requestKey) {
      setLoading(false);
      return;
    }
    keyRef.current = requestKey;
    setError(null);

    const cached = apiCache.get<T>(requestKey, ttl);
    if (cached !== null) {
      setData(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    apiCache
      .getOrFetch<T>(
        requestKey,
        () =>
          fetch(requestKey, { credentials: "include" }).then((res) => {
            if (res.status === 401 || res.status === 403) {
              // Session expired: silence auth failures and avoid retry storms.
              return undefined as T;
            }
            if (!res.ok) throw new Error(`${res.status}`);
            return res.json();
          }),
        ttl
      )
      .then((d) => {
        if (keyRef.current === requestKey) {
          if (d !== undefined) {
            setData(d);
          }
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (keyRef.current === requestKey) {
          setError(e instanceof Error ? e.message : "Fetch failed");
          setLoading(false);
        }
      });
  }, [requestKey, ttl]);

  return {
    data,
    loading,
    error,
    refetch: () => setVersion((v) => v + 1),
  };
}

export function useParallelFetch<T extends Record<string, unknown>>(
  requests: Record<keyof T, string | null>,
  ttl = 30_000
): { data: Partial<T>; loading: boolean } {
  const keys = Object.keys(requests) as (keyof T)[];
  const serialized = JSON.stringify(requests);
  const [data, setData] = useState<Partial<T>>(() => {
    const initial: Partial<T> = {};
    for (const key of keys) {
      const url = requests[key];
      if (url) {
        const cached = apiCache.get(url, ttl);
        if (cached !== null) initial[key] = cached as T[keyof T];
      }
    }
    return initial;
  });
  const [loading, setLoading] = useState(keys.some((k) => !data[k] && !!requests[k]));

  useEffect(() => {
    const nextData: Partial<T> = {};
    for (const key of keys) {
      const url = requests[key];
      if (!url) continue;
      const cached = apiCache.get(url, ttl);
      if (cached !== null) {
        nextData[key] = cached as T[keyof T];
      }
    }
    setData((prev) => ({ ...prev, ...nextData }));

    const missing = keys.filter((k) => {
      const url = requests[k];
      if (!url) return false;
      return apiCache.get(url, ttl) === null;
    });

    if (missing.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all(
      missing.map((key) => {
        const url = requests[key]!;
        return apiCache
          .getOrFetch(
            url,
            () =>
              fetch(url, { credentials: "include" }).then((res) => {
                if (res.status === 401 || res.status === 403) {
                  // Session expired: silence auth failures and avoid retry storms.
                  return undefined;
                }
                if (!res.ok) throw new Error(`${res.status}`);
                return res.json();
              }),
            ttl
          )
          .then((d) => ({ key, d }));
      })
    )
      .then((results) => {
        setData((prev) => {
          const next = { ...prev };
          for (const { key, d } of results) {
            if (d !== undefined) next[key] = d as T[keyof T];
          }
          return next;
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [serialized, ttl]);

  return { data, loading };
}
