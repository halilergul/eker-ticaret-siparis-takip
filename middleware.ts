import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Aşağıdakiler hariç tüm request'lere uygulanır:
     * - _next/static (statik dosyalar)
     * - _next/image (resim optimizasyonu)
     * - favicon.ico
     * - public klasöründeki resim dosyaları
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
