"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Atualiza os dados da página a cada alguns segundos (quando a aba está visível).
// Mantém o que o usuário está digitando: só os dados do servidor são recarregados.
export function AutoRefresh({ intervalMs = 12000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);
  return null;
}
