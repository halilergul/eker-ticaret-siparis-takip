"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
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
      {state?.error ? (
        <Notice intent="danger" title="Giriş başarısız" body={state.error} />
      ) : null}

      <Field
        id="email"
        label="E-posta"
        type="email"
        autoComplete="email"
        register={register("email")}
        error={errors.email?.message}
      />

      <Field
        id="password"
        label="Şifre"
        type="password"
        autoComplete="current-password"
        register={register("password")}
        error={errors.password?.message}
      />

      <Button kind="primary" size="lg" type="submit" full disabled={isPending}>
        {isPending ? "Giriş yapılıyor…" : "Giriş yap"}
      </Button>
    </form>
  );
}

type FieldProps = {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
  register: ReturnType<ReturnType<typeof useForm<LoginInput>>["register"]>;
  error?: string;
};

function Field({ id, label, type, autoComplete, register, error }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[13px] font-medium text-slate-700"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        className={[
          "h-11 rounded-xl bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400",
          "transition-colors et-focus",
          error
            ? "border border-rose-500 focus:border-rose-600"
            : "border border-slate-200 focus:border-slate-900",
        ].join(" ")}
        {...register}
      />
      {error ? (
        <p id={`${id}-err`} className="text-xs text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
