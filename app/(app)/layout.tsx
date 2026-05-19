import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/routes";
import { TopNav } from "@/components/layout/top-nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense-in-depth: middleware zaten guard yapıyor, layout ikinci kontrol.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  return (
    <div className="et-page min-h-screen pb-16">
      <TopNav />
      {/* Top spacer pushes content past the floating 64px nav + 16px margin */}
      <div className="pt-28">{children}</div>
    </div>
  );
}
