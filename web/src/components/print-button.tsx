"use client";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">
      {label}
    </button>
  );
}
