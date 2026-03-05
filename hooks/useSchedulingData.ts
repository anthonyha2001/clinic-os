"use client";

import { useEffect, useRef, useState } from "react";

type CacheEntry<T> = { data: T; ts: number };

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

function isFresh(ts: number, ttlMs: number) {
  return Date.now() - ts < ttlMs;
}

export async function fetchWithCache<T>(url: string, ttlMs = 30_000): Promise<T> {
  const hit = cache.get(url);
  if (hit && isFresh(hit.ts, ttlMs)) {
    return hit.data as T;
  }

  const pending = inFlight.get(url);
  if (pending) {
    return pending as Promise<T>;
  }

  const request = fetch(url, { credentials: "include" })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      return (await res.json()) as T;
    })
    .then((data) => {
      cache.set(url, { data, ts: Date.now() });
      return data;
    })
    .finally(() => {
      inFlight.delete(url);
    });

  inFlight.set(url, request);
  return request;
}

export function useCachedFetch<T>(url: string, ttlMs = 30_000) {
  const [data, setData] = useState<T | null>(() => {
    const hit = cache.get(url);
    return hit && isFresh(hit.ts, ttlMs) ? (hit.data as T) : null;
  });
  const [loading, setLoading] = useState(() => data == null);
  const [error, setError] = useState<string | null>(null);
  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    const key = `${url}:${ttlMs}`;

    // Prevent duplicate effect work for the same request key per mount.
    if (lastKeyRef.current === key) {
      return;
    }
    lastKeyRef.current = key;

    const hit = cache.get(url);
    if (hit && isFresh(hit.ts, ttlMs)) {
      setData(hit.data as T);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetchWithCache<T>(url, ttlMs)
      .then((value) => {
        if (!cancelled) {
          setData(value);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, ttlMs]);

  return { data, loading, error };
}
