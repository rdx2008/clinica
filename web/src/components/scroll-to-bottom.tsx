"use client";

import { useEffect, useRef } from "react";

// Mantém a conversa rolada até a última mensagem ao abrir e quando chega mensagem nova.
export function ScrollToBottom({ trigger }: { trigger: number | string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [trigger]);
  return <div ref={ref} aria-hidden="true" />;
}
