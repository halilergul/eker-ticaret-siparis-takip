import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/routes";
import { IconButton } from "@/components/ui/button";
import { LogoutMenu } from "./logout-menu";
import { TopNavLinks } from "./top-nav-links";

/**
 * Floating glass pill navigation bar per design brief §3.1.
 *
 * 64px tall, rounded-full, sits 16px from top edge of viewport, max ~95%
 * page width. Centered nav items use an animated pill highlight on the
 * active route.
 *
 * Server Component for the shell + Supabase user fetch; the active-link
 * detection is delegated to a small Client Component sibling.
 */

export async function TopNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Surname-first monogram from the email local part (e.g. "halil" → "H").
  const initial = (user.email?.[0] ?? "?").toUpperCase();

  return (
    <header className="absolute inset-x-6 top-4 z-20 mx-auto flex max-w-[1320px] items-center justify-center sm:inset-x-10">
      <div className="et-glass flex h-16 w-full items-center gap-5 rounded-full pl-5 pr-4">
        {/* Brand */}
        <Link
          href={ROUTES.DASHBOARD}
          className="flex flex-none items-center gap-2.5 et-focus rounded-full pr-1"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-slate-900 to-slate-700 text-amber-500 text-sm font-bold tracking-tight"
          >
            ET
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">
            Eker Ticaret
          </span>
        </Link>

        {/* Center nav (client component because it reads pathname for active state) */}
        <TopNavLinks />

        {/* Right cluster */}
        <div className="flex flex-none items-center gap-2.5">
          <IconButton icon="bell" badge label="Bildirimler" />
          <LogoutMenu initial={initial} email={user.email ?? ""} />
        </div>
      </div>
    </header>
  );
}
