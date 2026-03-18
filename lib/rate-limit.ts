const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

export function checkRateLimit(
  key: string,
  options: RateLimitOptions = { maxRequests: 5, windowMs: 60_000 },
): { success: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + options.windowMs });
    return { success: true, remaining: options.maxRequests - 1 };
  }

  entry.count++;

  if (entry.count > options.maxRequests) {
    return { success: false, remaining: 0 };
  }

  return { success: true, remaining: options.maxRequests - entry.count };
}

export function resetRateLimit(key: string): void {
  rateLimitMap.delete(key);
}
