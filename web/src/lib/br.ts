// Utilitários de formato brasileiro. Sem dependências internas (testável isoladamente).

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export function isValidCpf(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(cpf[len])) return false;
  }
  return true;
}

// Exibe só os 2 últimos dígitos: ***.***.***-09
export function maskCpf(cpf: string): string {
  const d = onlyDigits(cpf);
  return `***.***.***-${d.slice(-2)}`;
}

// Normaliza telefone brasileiro para E.164 (+55...). Retorna null se inválido.
export function normalizePhoneBR(input: string): string | null {
  let d = onlyDigits(input);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== "9") return null; // celular começa com 9
  return `+55${d}`;
}

export function formatPhoneBR(e164: string): string {
  const d = onlyDigits(e164).replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}

// Idade em anos completos (data de nascimento em UTC, como é gravada).
export function ageYears(birth: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// Nome normalizado para comparar duplicidade (sem acento, minúsculo, espaços únicos).
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// CPF válido determinístico (apenas para dados de demonstração e testes).
export function generateValidCpf(seed: number): string {
  const base = String(100000000 + ((seed * 7919) % 899999999)).slice(0, 9);
  const calc = (digits: number[]) => {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) sum += digits[i] * (digits.length + 1 - i);
    return ((sum * 10) % 11) % 10;
  };
  const nums = [...base].map(Number);
  const d1 = calc(nums);
  const d2 = calc([...nums, d1]);
  return `${base}${d1}${d2}`;
}
