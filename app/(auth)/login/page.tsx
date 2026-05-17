import type { Metadata } from "next";
import { LoginForm } from "@/components/features/auth/login-form";

export const metadata: Metadata = {
  title: "Giriş — Eker Ticaret",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-6 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Eker Ticaret
          </h1>
          <p className="text-sm text-slate-600">
            Devam etmek için giriş yapın.
          </p>
        </header>
        <LoginForm />
      </div>
    </main>
  );
}
