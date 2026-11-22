// Escalas de rastreio (PHQ-9 e GAD-7): itens, pontuação e interpretação. Sem dependências internas.
// Ambas são de domínio público (Pfizer). A interpretação é de apoio ao profissional: não é diagnóstico.

export type ScaleKey = "PHQ9" | "GAD7";

export type ScaleDef = {
  key: ScaleKey;
  name: string;
  full: string;
  period: string;
  items: string[];
  options: { value: number; label: string }[];
  max: number;
  bands: { upTo: number; label: string; tone: "ok" | "leve" | "moderado" | "grave" }[];
  riskItem?: number; // índice (0-based) de item que sinaliza risco quando > 0
};

const FREQ = [
  { value: 0, label: "Nenhuma vez" },
  { value: 1, label: "Vários dias" },
  { value: 2, label: "Mais da metade dos dias" },
  { value: 3, label: "Quase todos os dias" },
];

export const SCALES: Record<ScaleKey, ScaleDef> = {
  PHQ9: {
    key: "PHQ9",
    name: "PHQ-9",
    full: "Questionário sobre a Saúde do Paciente (sintomas depressivos)",
    period: "Nas últimas 2 semanas, com que frequência você foi incomodado(a) por qualquer um dos problemas abaixo?",
    items: [
      "Pouco interesse ou pouco prazer em fazer as coisas",
      "Se sentir para baixo, deprimido(a) ou sem perspectiva",
      "Dificuldade para pegar no sono ou permanecer dormindo, ou dormir mais do que o habitual",
      "Se sentir cansado(a) ou com pouca energia",
      "Falta de apetite ou comer demais",
      "Se sentir mal consigo mesmo(a), ou achar que é um fracasso ou que decepcionou sua família ou a si mesmo(a)",
      "Dificuldade para se concentrar nas coisas, como ler o jornal ou ver televisão",
      "Lentidão para se movimentar ou falar, a ponto de outras pessoas perceberem; ou o oposto: estar tão agitado(a) ou inquieto(a) que fica andando de um lado para o outro muito mais do que de costume",
      "Pensar em se ferir de alguma maneira ou que seria melhor estar morto(a)",
    ],
    options: FREQ,
    max: 27,
    bands: [
      { upTo: 4, label: "Sintomas mínimos", tone: "ok" },
      { upTo: 9, label: "Sintomas leves", tone: "leve" },
      { upTo: 14, label: "Sintomas moderados", tone: "moderado" },
      { upTo: 19, label: "Sintomas moderadamente graves", tone: "grave" },
      { upTo: 27, label: "Sintomas graves", tone: "grave" },
    ],
    riskItem: 8,
  },
  GAD7: {
    key: "GAD7",
    name: "GAD-7",
    full: "Transtorno de Ansiedade Generalizada (sintomas de ansiedade)",
    period: "Nas últimas 2 semanas, com que frequência você foi incomodado(a) pelos problemas abaixo?",
    items: [
      "Sentir-se nervoso(a), ansioso(a) ou muito tenso(a)",
      "Não ser capaz de impedir ou de controlar as preocupações",
      "Preocupar-se muito com diversas coisas",
      "Dificuldade para relaxar",
      "Ficar tão agitado(a) que se torna difícil permanecer sentado(a)",
      "Ficar facilmente aborrecido(a) ou irritado(a)",
      "Sentir medo como se algo horrível fosse acontecer",
    ],
    options: FREQ,
    max: 21,
    bands: [
      { upTo: 4, label: "Ansiedade mínima", tone: "ok" },
      { upTo: 9, label: "Ansiedade leve", tone: "leve" },
      { upTo: 14, label: "Ansiedade moderada", tone: "moderado" },
      { upTo: 21, label: "Ansiedade grave", tone: "grave" },
    ],
  },
};

export function isScaleKey(k: string): k is ScaleKey {
  return k === "PHQ9" || k === "GAD7";
}

export type ScaleResult = { score: number; severity: string; tone: ScaleDef["bands"][number]["tone"]; risk: boolean };

// Valida as respostas (uma por item, de 0 a 3) e calcula pontuação, faixa e sinal de risco.
export function scoreScale(key: ScaleKey, answers: unknown): ScaleResult | null {
  const def = SCALES[key];
  if (!Array.isArray(answers) || answers.length !== def.items.length) return null;
  if (!answers.every((a) => Number.isInteger(a) && a >= 0 && a <= 3)) return null;
  const nums = answers as number[];
  const score = nums.reduce((t, n) => t + n, 0);
  const band = def.bands.find((b) => score <= b.upTo) ?? def.bands[def.bands.length - 1];
  const risk = def.riskItem !== undefined && nums[def.riskItem] > 0;
  return { score, severity: band.label, tone: band.tone, risk };
}

// Variação entre duas aplicações: negativa = melhora (menos sintomas).
export function trend(prev: number | null, curr: number): { delta: number; label: string } | null {
  if (prev === null) return null;
  const delta = curr - prev;
  if (Math.abs(delta) < 2) return { delta, label: "estável" };
  return { delta, label: delta < 0 ? "melhora" : "piora" };
}

export const RISK_SUPPORT_MESSAGE =
  "Obrigado por responder. Se você está pensando em se machucar ou sente que não consegue lidar com isso agora, procure ajuda imediatamente: ligue 188 (CVV, 24 horas, gratuito) ou 192 (SAMU), ou vá ao pronto-socorro mais próximo. Seu(sua) psicólogo(a) será avisado(a) das suas respostas.";
