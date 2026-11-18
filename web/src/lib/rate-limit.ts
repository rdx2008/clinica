// Limitador simples em memória (por instância). Suficiente para o piloto com 1 réplica;
// com várias réplicas, migrar para Redis.
const attempts = new Map<string, { count: number; resetAt: number }>();

export function tooManyAttempts(key: string, max = 5): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= max;
}

export function registerFailure(key: string, windowMs = 15 * 60_000) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) attempts.set(key, { count: 1, resetAt: now + windowMs });
  else entry.count += 1;
}

export function clearFailures(key: string) {
  attempts.delete(key);
}
