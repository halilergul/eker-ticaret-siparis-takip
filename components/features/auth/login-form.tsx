"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { signIn, type SignInState } from "@/app/(auth)/login/actions";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState<SignInState, FormData>(
    signIn,
    undefined,
  );

  const {
    register,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
  });

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state?.error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-red-700">{errors.email.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">
          Şifre
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-red-700">{errors.password.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Giriş yapılıyor…" : "Giriş Yap"}
      </button>
    </form>
  );
}
