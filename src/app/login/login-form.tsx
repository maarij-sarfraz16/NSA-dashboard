"use client";

import { useActionState, useState } from "react";
import { signIn, type LoginState } from "@/app/actions";

const input =
  "mt-1 block h-9 w-full rounded border border-line bg-surface px-3 text-[14px] text-ink hover:border-line-strong";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block text-[13px] font-medium text-ink-2">
        Username or email
        <input
          name="username"
          autoComplete="username"
          required
          defaultValue={state.username}
          className={input}
        />
      </label>
      <label className="block text-[13px] font-medium text-ink-2">
        Password
        <span className="relative block">
          <input
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            className={`${input} pr-14`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute inset-y-0 right-0 mt-1 px-3 text-[12px] font-medium text-ink-2 hover:text-ink"
          >
            {show ? "Hide" : "Show"}
          </button>
        </span>
      </label>
      {state.error && (
        <p role="alert" className="rounded border border-bad/30 bg-bad-soft px-3 py-2 text-[13px] text-bad">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-9 w-full rounded bg-accent text-[14px] font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
