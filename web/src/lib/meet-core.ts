// Código de uma sala do Google Meet (abc-defg-hij) a partir de um endereço. Puro, testável.

const CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

export function isMeetCode(s: string): boolean {
  return CODE.test(s);
}

// Aceita o endereço completo (com ou sem https://, com parâmetros) e devolve o código em minúsculas.
export function meetCode(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (u.hostname.toLowerCase() !== "meet.google.com") return null;
    const first = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
    return CODE.test(first) ? first : null;
  } catch {
    return null;
  }
}

// Entre várias consultas com o mesmo link (série recorrente), escolhe a mais próxima de agora.
export function nearestTo<T extends { startsAt: Date }>(items: T[], now: Date = new Date()): T | null {
  let best: T | null = null;
  let bestDiff = Infinity;
  for (const it of items) {
    const d = Math.abs(it.startsAt.getTime() - now.getTime());
    if (d < bestDiff) {
      best = it;
      bestDiff = d;
    }
  }
  return best;
}
