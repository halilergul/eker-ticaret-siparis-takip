import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/features/auth/logout-button";
import { ROUTES } from "@/lib/routes";
import { TopBarNav } from "./top-bar-nav";

export async function TopBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4">
        <div className="flex items-center gap-6">
          <Link
            href={ROUTES.DASHBOARD}
            className="text-sm font-semibold text-slate-900 hover:text-slate-700"
          >
            Eker Ticaret
          </Link>
          <TopBarNav />
        </div>
        <div className="flex items-center gap-4">
          <p className="hidden text-sm text-slate-700 sm:block">
            <span className="font-medium">{user.email}</span>
          </p>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
