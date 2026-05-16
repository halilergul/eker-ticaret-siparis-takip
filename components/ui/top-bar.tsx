import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/features/auth/logout-button";

export async function TopBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <p className="text-sm text-slate-700">
          Merhaba <span className="font-medium">{user.email}</span>
        </p>
        <LogoutButton />
      </div>
    </header>
  );
}
