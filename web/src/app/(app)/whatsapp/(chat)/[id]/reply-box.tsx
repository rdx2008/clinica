"use client";

import { useState } from "react";
import { sendReplyAction } from "@/app/actions/whatsapp";

export function ReplyBox({ id, quick }: { id: string; quick: { id: string; title: string; body: string }[] }) {
  const [text, setText] = useState("");
  return (
    <form action={sendReplyAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      {quick.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button key={q.id} type="button" onClick={() => setText((t) => (t ? `${t}\n${q.body}` : q.body))} className="rounded-full border bg-white px-2.5 py-1 text-xs hover:bg-zinc-50" title={q.body}>
              {q.title}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <textarea
          name="body"
          required
          rows={3}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva a resposta…"
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <button className="self-end rounded bg-emerald-700 px-4 py-2 text-sm text-white">Enviar</button>
      </div>
    </form>
  );
}
