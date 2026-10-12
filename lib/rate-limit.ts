/**
 * Rate Limiter en memoria para mitigación de ataques de fuerza bruta y saturación de API.
 */

type RateLimitRecord = { count: number; resetAt: number };
const rateLimitMap = new Map<string, RateLimitRecord>();

// Limpieza periódica para evitar fugas de memoria
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 60_000).unref?.();

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 60,
  windowMs: number = 60_000,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetAt) {
    const newRecord: RateLimitRecord = { count: 1, resetAt: now + windowMs };
    rateLimitMap.set(identifier, newRecord);
    return { allowed: true, remaining: maxRequests - 1, resetAt: newRecord.resetAt };
  }

  record.count += 1;
  if (record.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  return { allowed: true, remaining: maxRequests - record.count, resetAt: record.resetAt };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}
