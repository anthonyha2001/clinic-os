const ipMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = ipMap.get(ip);

  if (!entry || now > entry.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  if (entry.count >= limit) return false; // blocked

  entry.count++;
  return true; // allowed
}

// Clean up old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(ipMap.entries());
  for (const [key, val] of entries) {
    if (now > val.resetAt) ipMap.delete(key);
  }
}, 5 * 60 * 1000);
