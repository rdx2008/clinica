"use client";

import { startTransition, useActionState } from "react";
import type { FormEvent } from "react";

// useActionState + envio manual do formulário.
// No React 19, <form action={fn}> limpa todos os campos depois de cada envio, inclusive quando a ação
// devolve um erro (o usuário perdia tudo o que tinha digitado). Aqui o envio é feito por onSubmit,
// então os campos permanecem preenchidos; em caso de sucesso a ação redireciona e a página sai.
export function useKeptActionState<S extends object>(action: (prev: S, formData: FormData) => Promise<S>, initial: S): readonly [S, (e: FormEvent<HTMLFormElement>) => void, boolean] {
  const [state, formAction, pending] = useActionState(action as unknown as (prev: object, formData: FormData) => Promise<object>, initial);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(data));
  };
  return [state as S, onSubmit, pending] as const;
}
