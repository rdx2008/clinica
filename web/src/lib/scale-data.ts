import { decryptField } from "./crypto";

export type ScaleData = { answers: number[]; score: number; severity: string };

// Lê o conteúdo criptografado de uma aplicação de escala (resposta, pontuação e faixa).
export function readScaleData(enc: string | null): ScaleData | null {
  if (!enc) return null;
  try {
    return JSON.parse(decryptField(enc)) as ScaleData;
  } catch {
    return null;
  }
}
