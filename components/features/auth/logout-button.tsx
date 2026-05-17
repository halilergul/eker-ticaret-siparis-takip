"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";

export function LogoutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Çıkış
      </button>
    </form>
  );
}
