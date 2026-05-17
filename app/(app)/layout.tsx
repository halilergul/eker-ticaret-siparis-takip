import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/routes";
import { TopBar } from "@/components/ui/top-bar";

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
    <div className="flex min-h-screen flex-col bg-slate-50">
      <TopBar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
